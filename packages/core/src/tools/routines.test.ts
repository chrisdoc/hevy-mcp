/* oxlint-disable typescript/unbound-method */
import type { JSONObject } from "@modelcontextprotocol/server";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import {
	createMockHevyClient,
	createMockMcpServer,
} from "../../test-fixtures/mock-hevy.js";
import {
	routinesGetDescriptor,
	routinesListDescriptor,
	workoutsGetDescriptor,
	workoutsListDescriptor,
	type HevyOperations,
} from "@hevy-mcp/operations";
import type { ToolExecutionContext } from "../execution.js";
import type { McpToolResponse } from "../utils/response-contracts.js";
import { HevyHttpError } from "@hevy-mcp/hevy-client";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getResultTelemetry } from "../utils/result-telemetry.js";
import { createToolRuntime } from "./tool-runtime.js";
import { registerToolDefinition } from "./define-tool.js";
import { routineToolDefinitions } from "./routines.js";

function register(
	client: HevyClient | null,
	operations?: HevyOperations,
	execution?: ToolExecutionContext,
) {
	const { server, registerTool: tool } = createMockMcpServer();
	const runtime = createToolRuntime({
		client,
		operations,
		execution,
		catalog: {} as never,
	});
	for (const definition of routineToolDefinitions)
		registerToolDefinition(server, runtime, definition);
	return tool;
}

function handler(tool: { mock: { calls: unknown[][] } }, name: string) {
	const call = tool.mock.calls.find(
		([registeredName]) => registeredName === name,
	);
	if (!call) throw new Error(`Tool ${name} was not registered`);
	return call.at(-1) as (args: JSONObject) => Promise<McpToolResponse>;
}

const routineInput = {
	routine: {
		title: "Push",
		folder_id: 3,
		exercises: [
			{
				exercise_template_id: "bench",
				superset_id: null,
				sets: [{ reps: 8, rep_range: { start: 8, end: 12 } }],
			},
		],
	},
};

describe("routine tools", () => {
	it("records expected telemetry for a missing routine", async () => {
		const client = createMockHevyClient();
		client.getRoutineById.mockRejectedValue(
			new HevyHttpError("routine not found", {
				status: 404,
				method: "GET",
				endpoint: "/v1/routines/:routineId",
			}),
		);
		const tool = register(client);
		const response = await handler(
			tool,
			"get-routine",
		)({
			routine_id: "missing",
		});

		expect(getResultTelemetry(response)).toMatchObject({
			itemCountBucket: "0",
			expected404Outcome: "not_found",
		});
	});

	it("maps pagination and identifiers to generated client calls", async () => {
		const client = createMockHevyClient();
		client.getRoutines.mockResolvedValue({ routines: [], page_count: 1 });
		client.getRoutineById.mockResolvedValue({
			routine: { id: "r1", title: "Push", folder_id: 3, exercises: [] },
		});
		const tool = register(client);
		await handler(tool, "get-routines")({ page: 2, page_size: 5 });
		await handler(tool, "get-routine")({ routine_id: "r1" });
		expect(client.getRoutines).toHaveBeenCalledWith({ page: 2, pageSize: 5 });
		expect(client.getRoutineById).toHaveBeenCalledWith("r1");
	});

	it("uses the injected routines list operation and execution context", async () => {
		const execute = vi.fn().mockResolvedValue({
			items: [{ id: "r1", title: "Push", exercises: [] }],
			page: 2,
			pageCount: 3,
		});
		const operations = {
			routines: {
				get: { descriptor: routinesGetDescriptor, execute: vi.fn() },
				list: { descriptor: routinesListDescriptor, execute },
			},
			workouts: {
				get: { descriptor: workoutsGetDescriptor, execute: vi.fn() },
				list: { descriptor: workoutsListDescriptor, execute: vi.fn() },
			},
		} satisfies HevyOperations;
		const execution: ToolExecutionContext = {
			signal: new AbortController().signal,
			deadline: Date.now() + 5_000,
		};
		const tool = register(null, operations, execution);

		const response = await handler(
			tool,
			"get-routines",
		)({
			page: 2,
			page_size: 5,
		});

		expect(execute).toHaveBeenCalledWith({ page: 2, pageSize: 5 }, execution);
		expect(response).toMatchObject({
			structuredContent: {
				routines: [{ id: "r1", title: "Push" }],
				page: 2,
				page_count: 3,
			},
		});
	});

	it("uses the injected routines get operation and execution context", async () => {
		const execute = vi.fn().mockResolvedValue({
			routine: { id: "r1", title: "Push", exercises: [] },
		});
		const operations = {
			routines: {
				get: { descriptor: routinesGetDescriptor, execute },
				list: { descriptor: routinesListDescriptor, execute: vi.fn() },
			},
			workouts: {
				get: { descriptor: workoutsGetDescriptor, execute: vi.fn() },
				list: { descriptor: workoutsListDescriptor, execute: vi.fn() },
			},
		} satisfies HevyOperations;
		const execution: ToolExecutionContext = {
			signal: new AbortController().signal,
			deadline: Date.now() + 5_000,
		};
		const tool = register(null, operations, execution);

		const response = await handler(
			tool,
			"get-routine",
		)({
			routine_id: "r1",
		});

		expect(execute).toHaveBeenCalledWith({ routineId: "r1" }, execution);
		expect(response).toMatchObject({
			structuredContent: { routine: { id: "r1", title: "Push" } },
		});
	});

	it("parses a routine whose exercise rest_seconds is an integer", async () => {
		// Regression: the Hevy API returns rest_seconds as an integer, but the
		// Routine read schema (and the get-routine output contract) previously
		// typed it as a string, so output validation rejected every routine.
		const client = createMockHevyClient();
		client.getRoutineById.mockResolvedValue({
			routine: {
				id: "r1",
				title: "Legs A",
				exercises: [
					{
						index: 0,
						title: "Hip Thrust (Barbell)",
						exercise_template_id: "D57C2EC7",
						rest_seconds: 120,
						sets: [{ type: "normal", weight_kg: 22.68, reps: 12 }],
					},
				],
			},
		});
		const tool = register(client);

		const response = await handler(tool, "get-routine")({ routine_id: "r1" });

		expect(response).not.toMatchObject({ isError: true });
		expect(response).toMatchObject({
			structuredContent: {
				routine: { exercises: [{ rest_seconds: 120 }] },
			},
		});
	});

	it("returns a standard error response for a bounded timeout", async () => {
		const client = createMockHevyClient();
		client.getRoutineById.mockRejectedValue(
			new HevyHttpError("request timed out", {
				method: "GET",
				endpoint: "/v1/routines/:routineId",
				code: "ETIMEDOUT",
			}),
		);
		const tool = register(client);
		const response = await handler(
			tool,
			"get-routine",
		)({
			routine_id: "routine-1",
		});

		expect(response).toMatchObject({ isError: true });
	});

	it("returns a confirmed acknowledgement when creation has no body", async () => {
		const client = createMockHevyClient();
		client.createRoutine.mockResolvedValue({});
		const tool = register(client);

		const response = await handler(tool, "create-routine")(routineInput);

		expect(response).toMatchObject({
			structuredContent: {
				created: true,
				commit_state: "confirmed",
				routine: null,
				routine_id: null,
				uses_rep_ranges: true,
			},
		});
	});

	it("returns the authoritative routine and ID when creation has a body", async () => {
		const client = createMockHevyClient();
		client.createRoutine.mockResolvedValue({
			id: "routine-1",
			title: "Push",
			exercises: [],
		});
		const tool = register(client);

		const response = await handler(tool, "create-routine")(routineInput);

		expect(response.structuredContent).toMatchObject({
			created: true,
			commit_state: "confirmed",
			routine_id: "routine-1",
			routine: { id: "routine-1", title: "Push" },
		});
	});

	it("passes nested snake_case routine payloads to create and update", async () => {
		const client = createMockHevyClient();
		client.createRoutine.mockResolvedValue(routineInput.routine);
		client.updateRoutine.mockResolvedValue(routineInput.routine);
		const tool = register(client);

		await handler(tool, "create-routine")(routineInput);
		await handler(
			tool,
			"update-routine",
		)({
			routine_id: "r1",
			routine: { title: "Push", exercises: routineInput.routine.exercises },
		});
		expect(client.createRoutine).toHaveBeenCalledWith(
			expect.objectContaining({
				routine: expect.objectContaining({ title: "Push", folder_id: 3 }),
			}),
		);
		expect(client.updateRoutine).toHaveBeenCalledWith(
			"r1",
			expect.objectContaining({
				routine: expect.objectContaining({ title: "Push" }),
			}),
		);
	});

	it("rejects legacy camelCase envelopes before invoking the client", () => {
		register(null);
		const definition = routineToolDefinitions.find(
			({ name }) => name === "create-routine",
		);
		if (!definition) throw new Error("create-routine definition is missing");
		const inputSchema = z.strictObject(definition.inputSchema);
		expect(() =>
			inputSchema.parse({
				routine: { title: "Push", folderId: 3, exercises: [] },
			}),
		).toThrow();
	});
});
