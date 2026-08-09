/* oxlint-disable typescript/unbound-method */
import type { McpServer } from "@modelcontextprotocol/server";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import {
	routinesGetDescriptor,
	routinesListDescriptor,
	type HevyOperations,
	workoutsGetDescriptor,
	workoutsListDescriptor,
} from "@hevy-mcp/operations";
import type { ToolExecutionContext } from "../execution.js";
import { describe, expect, it, vi } from "vitest";
import { createToolRuntime } from "./tool-runtime.js";
import { registerToolDefinition } from "./define-tool.js";
import { workoutToolDefinitions } from "./workouts.js";

function register(
	client: HevyClient | null,
	operations?: HevyOperations,
	execution?: ToolExecutionContext,
) {
	const tool = vi.fn();
	const server = { tool, registerTool: tool } as unknown as McpServer;
	const runtime = createToolRuntime({
		client,
		operations,
		execution,
		catalog: {} as never,
	});
	for (const definition of workoutToolDefinitions) {
		registerToolDefinition(server, runtime, definition);
	}
	return tool;
}

function toolHandler(tool: ReturnType<typeof vi.fn>, name: string) {
	const call = tool.mock.calls.find(
		([registeredName]) => registeredName === name,
	);
	if (!call) throw new Error(`Tool ${name} was not registered`);
	return call.at(-1) as (args: object) => Promise<object>;
}

const workoutInput = {
	workout: {
		title: "Push",
		start_time: "2025-01-01T10:00:00Z",
		end_time: "2025-01-01T11:00:00Z",
		exercises: [
			{ exercise_template_id: "bench", sets: [{ type: "normal", reps: 8 }] },
		],
	},
};

describe("workout tools", () => {
	it("exposes only generated-aligned snake_case input keys", () => {
		const tool = register(null);
		const definition = tool.mock.calls.find(
			([name]) => name === "get-workouts",
		)?.[1] as { inputSchema: { parse(value: unknown): unknown } };

		expect(definition.inputSchema.parse({ page: 2, page_size: 5 })).toEqual({
			page: 2,
			page_size: 5,
		});
		expect(() =>
			definition.inputSchema.parse({ page: 2, pageSize: 5 }),
		).toThrow();
	});

	it("maps snake_case pagination and identifiers to generated client arguments", async () => {
		const client = {
			getWorkouts: vi.fn().mockResolvedValue({ workouts: [], page_count: 2 }),
			getWorkout: vi.fn().mockResolvedValue({
				id: "w1",
				start_time: "2025-01-01T10:00:00Z",
				end_time: "2025-01-01T10:30:00Z",
			}),
			getWorkoutEvents: vi
				.fn()
				.mockResolvedValue({ events: [], page_count: 1 }),
		} as unknown as HevyClient;
		const tool = register(client);

		await toolHandler(tool, "get-workouts")({ page: 2, page_size: 5 });
		await toolHandler(tool, "get-workout")({ workout_id: "w1" });
		await toolHandler(
			tool,
			"get-workout-events",
		)({ page: 1, page_size: 5, since: "2025-01-01T00:00:00Z" });

		expect(client.getWorkouts).toHaveBeenCalledWith({ page: 2, pageSize: 5 });
		expect(client.getWorkout).toHaveBeenCalledWith("w1");
		expect(client.getWorkoutEvents).toHaveBeenCalledWith({
			page: 1,
			pageSize: 5,
			since: "2025-01-01T00:00:00Z",
		});
	});

	it("uses the injected workout get operation and execution context", async () => {
		const workoutsGetExecute = vi.fn().mockResolvedValue({
			workout: { id: "w1", title: "Push" },
		});
		const workoutsListExecute = vi.fn();
		const routinesGetExecute = vi.fn();
		const routinesListExecute = vi.fn();
		const operations: HevyOperations = {
			workouts: {
				get: {
					descriptor: workoutsGetDescriptor,
					execute: workoutsGetExecute,
				},
				list: {
					descriptor: workoutsListDescriptor,
					execute: workoutsListExecute,
				},
			},
			routines: {
				get: {
					descriptor: routinesGetDescriptor,
					execute: routinesGetExecute,
				},
				list: {
					descriptor: routinesListDescriptor,
					execute: routinesListExecute,
				},
			},
		};
		const execution: ToolExecutionContext = {
			signal: new AbortController().signal,
			deadline: Date.now() + 5_000,
		};
		const tool = register(null, operations, execution);

		const response = await toolHandler(
			tool,
			"get-workout",
		)({
			workout_id: "w1",
		});

		expect(workoutsGetExecute).toHaveBeenCalledWith(
			{ workoutId: "w1" },
			execution,
		);
		expect(response).toMatchObject({
			structuredContent: {
				workout: { id: "w1", title: "Push" },
			},
		});
		expect(response).toMatchObject({ content: [{ type: "text" }] });
	});

	it("gets before patching metadata and sends the exact built payload", async () => {
		const calls: string[] = [];
		const current = {
			id: "w1",
			title: "Original",
			description: "Keep",
			start_time: "2025-01-01T10:00:00Z",
			end_time: "2025-01-01T11:00:00Z",
			exercises: [
				{
					index: 0,
					title: "Bench Press",
					exercise_template_id: "bench",
					supersets_id: 4,
					sets: [
						{
							index: 0,
							type: "normal",
							weight_kg: 50,
							reps: 8,
							distance_meters: null,
							duration_seconds: null,
							rpe: null,
							custom_metric: null,
						},
					],
				},
			],
		};
		const client = {
			createWorkout: vi
				.fn()
				.mockResolvedValue({ id: "w1", ...workoutInput.workout }),
			getWorkout: vi.fn().mockImplementation(() => {
				calls.push("get");
				return Promise.resolve(current);
			}),
			updateWorkout: vi.fn().mockImplementation(() => {
				calls.push("put");
				return Promise.resolve(current);
			}),
		} as unknown as HevyClient;
		const tool = register(client);

		await toolHandler(tool, "create-workout")(workoutInput);
		const response = await toolHandler(
			tool,
			"update-workout",
		)({
			workout_id: "w1",
			workout: { title: "Renamed", description: null },
		});

		expect(response).not.toMatchObject({ isError: true });
		expect(calls).toEqual(["get", "put"]);
		expect(client.updateWorkout).toHaveBeenCalledWith("w1", {
			workout: {
				title: "Renamed",
				description: null,
				start_time: "2025-01-01T10:00:00Z",
				end_time: "2025-01-01T11:00:00Z",
				exercises: [
					{
						exercise_template_id: "bench",
						superset_id: 4,
						notes: null,
						sets: [
							{
								type: "normal",
								weight_kg: 50,
								reps: 8,
								distance_meters: null,
								duration_seconds: null,
								rpe: null,
								custom_metric: null,
							},
						],
					},
				],
			},
		});
		expect(response).toMatchObject({ content: [{ type: "text" }] });
	});

	it("gets before replacing exercises and preserves metadata", async () => {
		const current = {
			id: "w1",
			title: "Original",
			description: "Keep",
			start_time: "2025-01-01T10:00:00Z",
			end_time: "2025-01-01T11:00:00Z",
			exercises: [
				{
					exercise_template_id: "bench",
					sets: [{ type: "normal", reps: 8 }],
				},
			],
		};
		const client = {
			getWorkout: vi.fn().mockResolvedValue(current),
			updateWorkout: vi.fn().mockResolvedValue(current),
		} as unknown as HevyClient;
		const tool = register(client);

		await toolHandler(
			tool,
			"replace-workout-exercises",
		)({
			workout_id: "w1",
			workout: {
				exercises: [
					{
						exercise_template_id: "row",
						sets: [{ type: "failure", reps: 5 }],
					},
				],
			},
		});

		expect(client.getWorkout).toHaveBeenCalledWith("w1");
		expect(client.updateWorkout).toHaveBeenCalledWith("w1", {
			workout: {
				title: "Original",
				description: "Keep",
				start_time: "2025-01-01T10:00:00Z",
				end_time: "2025-01-01T11:00:00Z",
				exercises: [
					{
						exercise_template_id: "row",
						sets: [{ type: "failure", reps: 5 }],
					},
				],
			},
		});
	});

	it("does not put when GET fails", async () => {
		const getFailureClient = {
			getWorkout: vi.fn().mockRejectedValue(new Error("GET failed")),
			updateWorkout: vi.fn(),
		} as unknown as HevyClient;
		const getFailureTool = register(getFailureClient);
		const getFailure = await toolHandler(
			getFailureTool,
			"update-workout",
		)({
			workout_id: "w1",
			workout: { title: "Renamed" },
		});
		expect(getFailure).toMatchObject({ isError: true });
		expect(getFailureClient.updateWorkout).not.toHaveBeenCalled();
	});

	it("reports PUT failures after exactly one GET", async () => {
		const client = {
			getWorkout: vi.fn().mockResolvedValue({
				title: "Original",
				start_time: "2025-01-01T10:00:00Z",
				end_time: "2025-01-01T11:00:00Z",
				exercises: [],
			}),
			updateWorkout: vi.fn().mockRejectedValue(new Error("PUT failed")),
		} as unknown as HevyClient;
		const tool = register(client);

		const response = await toolHandler(
			tool,
			"update-workout",
		)({
			workout_id: "w1",
			workout: { title: "Renamed" },
		});

		expect(response).toMatchObject({ isError: true });
		expect(client.getWorkout).toHaveBeenCalledTimes(1);
		expect(client.updateWorkout).toHaveBeenCalledTimes(1);
	});
});
