import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";
import {
	routinesGetDescriptor,
	routinesListDescriptor,
	type HevyOperations,
	workoutsGetDescriptor,
	workoutsListDescriptor,
} from "@hevy-mcp/operations";
import { createMockHevyClient } from "../../test-fixtures/mock-hevy.js";
import {
	HevyClientService,
	HevyOperationsService,
} from "../effect-services.js";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";
import { createToolRuntime } from "./tool-runtime.js";
import { registerToolDefinition } from "./define-tool.js";
import { routineToolDefinitions } from "./routines.js";
import { templateToolDefinitions } from "./templates.js";
import { workoutToolDefinitions } from "./workouts.js";

const catalog: ExerciseTemplateCatalog = {
	get: () => Promise.resolve([]),
	reset: () => undefined,
};

function createSoft404Operations() {
	const workoutsGet = vi
		.fn()
		.mockResolvedValueOnce({
			workout: null,
			expected404Outcome: "not_found" as const,
		})
		.mockResolvedValueOnce({ workout: null });
	const workoutsList = vi
		.fn()
		.mockResolvedValueOnce({
			items: [],
			page: 2,
			pageCount: undefined,
			expected404Outcome: "end_of_list" as const,
		})
		.mockResolvedValueOnce({ items: [], page: 2, pageCount: undefined });
	const routinesGet = vi
		.fn()
		.mockResolvedValueOnce({
			routine: null,
			expected404Outcome: "not_found" as const,
		})
		.mockResolvedValueOnce({ routine: null });
	const routinesList = vi
		.fn()
		.mockResolvedValueOnce({
			items: [],
			page: 2,
			pageCount: undefined,
			expected404Outcome: "end_of_list" as const,
		})
		.mockResolvedValueOnce({ items: [], page: 2, pageCount: undefined });

	const operations = {
		workouts: {
			get: { descriptor: workoutsGetDescriptor, execute: workoutsGet },
			list: { descriptor: workoutsListDescriptor, execute: workoutsList },
		},
		routines: {
			get: { descriptor: routinesGetDescriptor, execute: routinesGet },
			list: { descriptor: routinesListDescriptor, execute: routinesList },
		},
	} satisfies HevyOperations;

	return {
		operations,
		workoutsGet,
		workoutsList,
		routinesGet,
		routinesList,
	};
}

async function connectReadTools(operations: HevyOperations) {
	const server = new McpServer({
		name: "cross-package-test-server",
		version: "1.0.0",
	});
	const runtime = createToolRuntime({
		client: null,
		operations,
		catalog,
	});
	for (const definition of [
		...workoutToolDefinitions.slice(0, 2),
		...routineToolDefinitions.slice(0, 2),
	]) {
		registerToolDefinition(server, runtime, definition);
	}
	const client = new Client({
		name: "cross-package-test-client",
		version: "1.0.0",
	});
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await Promise.all([
		server.connect(serverTransport),
		client.connect(clientTransport),
	]);
	return { client, server, runtime };
}

describe("cross-package core invariants", () => {
	it("preserves soft-404 and missing-body MCP JSON across all read tools", async () => {
		const { operations, workoutsGet, workoutsList, routinesGet, routinesList } =
			createSoft404Operations();
		const { client, server } = await connectReadTools(operations);

		try {
			const cases = [
				{
					name: "get-workout",
					arguments: { workout_id: "missing-workout" },
					execute: workoutsGet,
					notFoundText: "Workout with ID missing-workout not found",
				},
				{
					name: "get-workouts",
					arguments: { page: 2 },
					execute: workoutsList,
					notFoundText: "No workouts found for the specified parameters",
				},
				{
					name: "get-routine",
					arguments: { routine_id: "missing-routine" },
					execute: routinesGet,
					notFoundText: "Routine with ID missing-routine not found",
				},
				{
					name: "get-routines",
					arguments: { page: 2 },
					execute: routinesList,
					notFoundText: "No routines found for the specified parameters",
				},
			] as const;

			for (const { name, arguments: args, execute, notFoundText } of cases) {
				const soft404 = await client.callTool({ name, arguments: args });
				const missingBody = await client.callTool({ name, arguments: args });

				expect(soft404).toMatchObject({
					content: [{ type: "text", text: notFoundText }],
				});
				expect(soft404.structuredContent).toEqual(
					name === "get-workout"
						? { workout: null }
						: name === "get-routine"
							? { routine: null }
							: name === "get-workouts"
								? { workouts: [], page: 2 }
								: { routines: [], page: 2 },
				);
				expect(missingBody).toEqual(soft404);
				expect(JSON.stringify(soft404)).not.toMatch(
					/expected404Outcome|Effect|Cause|Layer/u,
				);
				expect(execute).toHaveBeenCalledTimes(2);
			}
		} finally {
			await Promise.all([client.close(), server.close()]);
		}
	});

	it("uses the layer-backed operations on the first callTool when getters diverge", async () => {
		const layerExecute = vi.fn().mockResolvedValue({
			workout: { id: "layer-workout", title: "Layer workout" },
		});
		const wrongGetterExecute = vi
			.fn()
			.mockRejectedValue(new Error("wrong source"));
		const layerOperations: HevyOperations = {
			workouts: {
				get: { descriptor: workoutsGetDescriptor, execute: layerExecute },
				list: {
					descriptor: workoutsListDescriptor,
					execute: vi.fn(),
				},
			},
			routines: {
				get: {
					descriptor: routinesGetDescriptor,
					execute: vi.fn(),
				},
				list: {
					descriptor: routinesListDescriptor,
					execute: vi.fn(),
				},
			},
		};
		const getterOperations: HevyOperations = {
			...layerOperations,
			workouts: {
				...layerOperations.workouts,
				get: {
					...layerOperations.workouts.get,
					execute: wrongGetterExecute,
				},
			},
		};
		const { client, server, runtime } = await connectReadTools(layerOperations);
		vi.spyOn(runtime, "getOperations").mockReturnValue(getterOperations);
		vi.spyOn(runtime, "forExecution").mockReturnValue(runtime);

		try {
			const result = await client.callTool({
				name: "get-workout",
				arguments: { workout_id: "layer-workout" },
			});

			expect(result).toMatchObject({
				structuredContent: {
					workout: { id: "layer-workout", title: "Layer workout" },
				},
			});
			expect(layerExecute).toHaveBeenCalledWith(
				{ workoutId: "layer-workout" },
				undefined,
			);
			expect(wrongGetterExecute).not.toHaveBeenCalled();
		} finally {
			await Promise.all([client.close(), server.close()]);
		}
	});

	it("rebinds client tools for execution while keeping operations on the parent layer", async () => {
		const client = createMockHevyClient();
		client.getExerciseTemplate.mockResolvedValue({
			id: "template-1",
			title: "Layer template",
		});
		const operations: HevyOperations = {
			workouts: {
				get: {
					descriptor: workoutsGetDescriptor,
					execute: vi.fn().mockResolvedValue({
						workout: { id: "workout-1", title: "Layer workout" },
					}),
				},
				list: {
					descriptor: workoutsListDescriptor,
					execute: vi.fn(),
				},
			},
			routines: {
				get: {
					descriptor: routinesGetDescriptor,
					execute: vi.fn(),
				},
				list: {
					descriptor: routinesListDescriptor,
					execute: vi.fn(),
				},
			},
		};
		const runtime = createToolRuntime({ client, operations, catalog });
		const execution = {
			requestId: "execution-1",
			signal: new AbortController().signal,
			deadline: Date.now() + 5_000,
		};
		const scoped = runtime.forExecution(execution);

		await expect(
			templateToolDefinitions[0].execute(scoped, {
				exercise_template_id: "template-1",
			}),
		).resolves.toMatchObject({
			exercise_template: { id: "template-1" },
		});

		expect(client.getExerciseTemplate).toHaveBeenCalledWith(
			"template-1",
			expect.objectContaining({
				signal: execution.signal,
				deadline: execution.deadline,
			}),
		);
		expect(runtime.service(HevyOperationsService)).toBe(operations);
		expect(scoped.service(HevyOperationsService)).toBe(operations);
		expect(scoped.service(HevyClientService)).not.toBe(client);
		expect(runtime.service(HevyClientService)).toBe(client);
	});
});
