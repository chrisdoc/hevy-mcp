/* oxlint-disable typescript/unbound-method */
import type { HevyClient } from "@hevy-mcp/hevy-client";
import { z } from "zod";
import {
	createMockHevyClient,
	createMockMcpServer,
} from "../../test-fixtures/mock-hevy.js";
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
import { workoutInputSchema } from "./input-schemas.js";
type WorkoutToolArgs = Parameters<
	(typeof workoutToolDefinitions)[number]["execute"]
>[1];

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
	return call.at(-1) as <TArgs extends WorkoutToolArgs>(
		args: TArgs,
	) => Promise<object>;
}

const workoutInput = workoutInputSchema.parse({
	workout: {
		title: "Push",
		start_time: "2025-01-01T10:00:00Z",
		end_time: "2025-01-01T11:00:00Z",
		exercises: [
			{ exercise_template_id: "bench", sets: [{ type: "normal", reps: 8 }] },
		],
	},
});

describe("workout tools", () => {
	it("exposes only generated-aligned snake_case input keys", () => {
		const tool = register(null);
		const registration = tool.mock.calls.find(
			([name]) => name === "get-workouts",
		);
		if (!registration) throw new Error("Tool was not registered");
		const inputSchema = registration[1]?.inputSchema;
		if (!inputSchema) throw new Error("Tool input schema is missing");
		const parsedInputSchema = z.instanceof(z.ZodType).parse(inputSchema);

		expect(parsedInputSchema.parse({ page: 2, page_size: 5 })).toEqual({
			page: 2,
			page_size: 5,
		});
		expect(() => parsedInputSchema.parse({ page: 2, pageSize: 5 })).toThrow();
	});

	it("maps snake_case pagination and identifiers to generated client arguments", async () => {
		const client = createMockHevyClient();
		client.getWorkouts.mockResolvedValue({ workouts: [], page_count: 2 });
		client.getWorkout.mockResolvedValue({
			id: "w1",
			start_time: "2025-01-01T10:00:00Z",
			end_time: "2025-01-01T10:30:00Z",
		});
		client.getWorkoutEvents.mockResolvedValue({ events: [], page_count: 1 });
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
		const client = createMockHevyClient();
		client.createWorkout.mockResolvedValue({
			id: "w1",
			...workoutInput.workout,
		});
		client.getWorkout.mockImplementation(() => {
			calls.push("get");
			return Promise.resolve(current);
		});
		client.updateWorkout.mockImplementation(() => {
			calls.push("put");
			return Promise.resolve(current);
		});
		const tool = register(client);

		await toolHandler(tool, "create-workout")(workoutInput);
		const response = await toolHandler(
			tool,
			"update-workout",
		)({
			workout_id: "w1",
			workout: { title: "Renamed", description: null, is_private: false },
		});

		expect(response).not.toMatchObject({ isError: true });
		expect(calls).toEqual(["get", "put"]);
		expect(client.updateWorkout).toHaveBeenCalledWith("w1", {
			workout: {
				title: "Renamed",
				description: null,
				start_time: "2025-01-01T10:00:00Z",
				end_time: "2025-01-01T11:00:00Z",
				is_private: false,
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
		const client = createMockHevyClient();
		client.getWorkout.mockResolvedValue(current);
		client.updateWorkout.mockResolvedValue(current);
		const tool = register(client);

		await toolHandler(
			tool,
			"replace-workout-exercises",
		)({
			workout_id: "w1",
			workout: {
				is_private: false,
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
				is_private: false,
				exercises: [
					{
						exercise_template_id: "row",
						sets: [{ type: "failure", reps: 5 }],
					},
				],
			},
		});
	});
	it("requires is_private when updating workout metadata", () => {
		const client = createMockHevyClient();
		client.getWorkout.mockResolvedValue({
			title: "Original",
			description: "Keep",
			start_time: "2025-01-01T10:00:00Z",
			end_time: "2025-01-01T11:00:00Z",
			exercises: [],
		});
		const tool = register(client);

		expect(() =>
			toolHandler(
				tool,
				"update-workout",
			)({
				workout_id: "w1",
				workout: { description: "Updated" },
			}),
		).toThrow("Invalid input");
		expect(client.getWorkout).not.toHaveBeenCalled();
		expect(client.updateWorkout).not.toHaveBeenCalled();
	});
	it("does not put when GET fails", async () => {
		const getFailureClient = createMockHevyClient();
		getFailureClient.getWorkout.mockRejectedValue(new Error("GET failed"));
		const getFailureTool = register(getFailureClient);
		const getFailure = await toolHandler(
			getFailureTool,
			"update-workout",
		)({
			workout_id: "w1",
			workout: { title: "Renamed", is_private: false },
		});
		expect(getFailure).toMatchObject({ isError: true });
		expect(getFailureClient.updateWorkout).not.toHaveBeenCalled();
	});

	it("reports PUT failures after exactly one GET", async () => {
		const client = createMockHevyClient();
		client.getWorkout.mockResolvedValue({
			title: "Original",
			start_time: "2025-01-01T10:00:00Z",
			end_time: "2025-01-01T11:00:00Z",
			exercises: [],
		});
		client.updateWorkout.mockRejectedValue(new Error("PUT failed"));
		const tool = register(client);

		const response = await toolHandler(
			tool,
			"update-workout",
		)({
			workout_id: "w1",
			workout: { title: "Renamed", is_private: false },
		});

		expect(response).toMatchObject({ isError: true });
		expect(client.getWorkout).toHaveBeenCalledTimes(1);
		expect(client.updateWorkout).toHaveBeenCalledTimes(1);
	});
});
