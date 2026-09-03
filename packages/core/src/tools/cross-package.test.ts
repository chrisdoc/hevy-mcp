import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { HevyExecutionOptions } from "@hevy-mcp/hevy-client";
import {
	routinesGetDescriptor,
	routinesListDescriptor,
	type HevyOperations,
	workoutsGetDescriptor,
	workoutsListDescriptor,
	templatesGetDescriptor,
	templatesHistoryDescriptor,
	templatesListAllDescriptor,
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
	effect: () => Effect.succeed([]),
	get: () => Promise.resolve([]),
	reset: () => undefined,
};

function createSoft404Operations() {
	const workoutsGet = vi
		.fn()
		.mockReturnValueOnce(
			Effect.succeed({
				workout: null,
				expected404Outcome: "not_found" as const,
			}),
		)
		.mockReturnValueOnce(Effect.succeed({ workout: null }));
	const workoutsList = vi
		.fn()
		.mockReturnValueOnce(
			Effect.succeed({
				items: [],
				page: 2,
				pageCount: undefined,
				expected404Outcome: "end_of_list" as const,
			}),
		)
		.mockReturnValueOnce(
			Effect.succeed({ items: [], page: 2, pageCount: undefined }),
		);
	const routinesGet = vi
		.fn()
		.mockReturnValueOnce(
			Effect.succeed({
				routine: null,
				expected404Outcome: "not_found" as const,
			}),
		)
		.mockReturnValueOnce(Effect.succeed({ routine: null }));
	const routinesList = vi
		.fn()
		.mockReturnValueOnce(
			Effect.succeed({
				items: [],
				page: 2,
				pageCount: undefined,
				expected404Outcome: "end_of_list" as const,
			}),
		)
		.mockReturnValueOnce(
			Effect.succeed({ items: [], page: 2, pageCount: undefined }),
		);

	const operations = {
		workouts: {
			get: {
				descriptor: workoutsGetDescriptor,
				effect: workoutsGet,
				execute: vi.fn(),
			},
			list: {
				descriptor: workoutsListDescriptor,
				effect: workoutsList,
				execute: vi.fn(),
			},
		},
		routines: {
			get: {
				descriptor: routinesGetDescriptor,
				effect: routinesGet,
				execute: vi.fn(),
			},
			list: {
				descriptor: routinesListDescriptor,
				effect: routinesList,
				execute: vi.fn(),
			},
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
					effect: workoutsGet,
					notFoundText: "Workout with ID missing-workout not found",
				},
				{
					name: "get-workouts",
					arguments: { page: 2 },
					effect: workoutsList,
					notFoundText: "No workouts found for the specified parameters",
				},
				{
					name: "get-routine",
					arguments: { routine_id: "missing-routine" },
					effect: routinesGet,
					notFoundText: "Routine with ID missing-routine not found",
				},
				{
					name: "get-routines",
					arguments: { page: 2 },
					effect: routinesList,
					notFoundText: "No routines found for the specified parameters",
				},
			] as const;

			for (const { name, arguments: args, effect, notFoundText } of cases) {
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
				expect(effect).toHaveBeenCalledTimes(2);
			}
		} finally {
			await Promise.all([client.close(), server.close()]);
		}
	});

	it("uses the layer-backed operations on the first callTool when getters diverge", async () => {
		const layerEffect = vi.fn(() =>
			Effect.succeed({
				workout: { id: "layer-workout", title: "Layer workout" },
			}),
		);
		const layerOperations: HevyOperations = {
			workouts: {
				get: {
					descriptor: workoutsGetDescriptor,
					effect: layerEffect,
					execute: vi.fn(),
				},
				list: {
					descriptor: workoutsListDescriptor,
					effect: vi.fn(),
					execute: vi.fn(),
				},
			},
			routines: {
				get: {
					descriptor: routinesGetDescriptor,
					effect: vi.fn(),
					execute: vi.fn(),
				},
				list: {
					descriptor: routinesListDescriptor,
					effect: vi.fn(),
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
					effect: vi.fn(() => Effect.fail(new Error("wrong source"))),
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
			expect(layerEffect).toHaveBeenCalledWith(
				{ workoutId: "layer-workout" },
				undefined,
			);
			expect(getterOperations.workouts.get.effect).not.toHaveBeenCalled();
		} finally {
			await Promise.all([client.close(), server.close()]);
		}
	});

	it("rebinds client tools for execution while keeping operations on the parent layer", async () => {
		const client = createMockHevyClient();
		const templateEffect = vi.fn(
			(
				_input: { exerciseTemplateId: string },
				_options?: HevyExecutionOptions,
			) =>
				Effect.succeed({
					exerciseTemplate: {
						id: "template-1",
						title: "Layer template",
					},
					exerciseTemplateId: "template-1",
				}),
		);
		const operations: HevyOperations = {
			workouts: {
				get: {
					descriptor: workoutsGetDescriptor,
					effect: vi.fn(),
					execute: vi.fn().mockResolvedValue({
						workout: { id: "workout-1", title: "Layer workout" },
					}),
				},
				list: {
					descriptor: workoutsListDescriptor,
					effect: vi.fn(),
					execute: vi.fn(),
				},
			},
			routines: {
				get: {
					descriptor: routinesGetDescriptor,
					effect: vi.fn(),
					execute: vi.fn(),
				},
				list: {
					descriptor: routinesListDescriptor,
					effect: vi.fn(),
					execute: vi.fn(),
				},
			},
			templates: {
				get: {
					descriptor: templatesGetDescriptor,
					effect: templateEffect,
					execute: vi.fn(),
				},
				history: {
					descriptor: templatesHistoryDescriptor,
					effect: vi.fn(() =>
						Effect.succeed({
							exerciseHistory: [],
							exerciseTemplateId: "template-1",
						}),
					),
					execute: vi.fn(),
				},
				listAll: {
					descriptor: templatesListAllDescriptor,
					effect: vi.fn(() => Effect.succeed([])),
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
			Effect.runPromise(
				templateToolDefinitions[0].execute(scoped, {
					exercise_template_id: "template-1",
				}),
			),
		).resolves.toMatchObject({
			exercise_template: { id: "template-1" },
		});

		expect(templateEffect).toHaveBeenCalledWith(
			{ exerciseTemplateId: "template-1" },
			execution,
		);
		expect(runtime.service(HevyOperationsService)).toBe(operations);
		expect(scoped.service(HevyOperationsService)).toBe(operations);
		expect(scoped.service(HevyClientService)).not.toBe(client);
		expect(runtime.service(HevyClientService)).toBe(client);
	});
});
