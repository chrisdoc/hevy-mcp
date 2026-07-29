/* oxlint-disable typescript/unbound-method */
import type { McpServer } from "@modelcontextprotocol/server";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import { HevyHttpError } from "@hevy-mcp/hevy-client";
import { describe, expect, it, vi } from "vitest";
import { getResultTelemetry } from "../utils/result-telemetry.js";
import { createToolRuntime } from "./tool-runtime.js";
import { registerToolDefinition } from "./define-tool.js";
import { routineToolDefinitions } from "./routines.js";

function register(client: HevyClient | null) {
	const tool = vi.fn();
	const server = { tool, registerTool: tool } as unknown as McpServer;
	const runtime = createToolRuntime({ client, catalog: {} as never });
	for (const definition of routineToolDefinitions)
		registerToolDefinition(server, runtime, definition);
	return tool;
}

function handler(tool: { mock: { calls: unknown[][] } }, name: string) {
	const call = tool.mock.calls.find(
		([registeredName]) => registeredName === name,
	);
	if (!call) throw new Error(`Tool ${name} was not registered`);
	return call.at(-1) as (
		args: Record<string, unknown>,
	) => Promise<Record<string, unknown>>;
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
		const client = {
			getRoutineById: vi.fn().mockRejectedValue(
				new HevyHttpError("routine not found", {
					status: 404,
					method: "GET",
					endpoint: "/v1/routines/:routineId",
				}),
			),
		} as unknown as HevyClient;
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
		const client = {
			getRoutines: vi.fn().mockResolvedValue({ routines: [], page_count: 1 }),
			getRoutineById: vi.fn().mockResolvedValue({
				routine: { id: "r1", title: "Push", folder_id: 3, exercises: [] },
			}),
		} as unknown as HevyClient;
		const tool = register(client);
		await handler(tool, "get-routines")({ page: 2, page_size: 5 });
		await handler(tool, "get-routine")({ routine_id: "r1" });
		expect(client.getRoutines).toHaveBeenCalledWith({ page: 2, pageSize: 5 });
		expect(client.getRoutineById).toHaveBeenCalledWith("r1");
	});

	it("passes nested snake_case routine payloads to create and update", async () => {
		const client = {
			createRoutine: vi.fn().mockResolvedValue(routineInput.routine),
			updateRoutine: vi.fn().mockResolvedValue(routineInput.routine),
		} as unknown as HevyClient;
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
		const tool = register(null);
		const definition = tool.mock.calls.find(
			([name]) => name === "create-routine",
		)?.[1] as { inputSchema: { parse(value: unknown): unknown } };
		expect(() =>
			definition.inputSchema.parse({
				routine: { title: "Push", folderId: 3, exercises: [] },
			}),
		).toThrow();
	});
});
