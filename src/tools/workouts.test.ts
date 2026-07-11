import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Workout } from "../generated/client/types/index.js";
import { formatWorkout } from "../utils/formatters.js";
import type { HevyClient } from "../utils/hevyClient.js";
import { workoutEventsOutputSchema } from "../utils/output-schemas.js";
import { registerWorkoutTools } from "./workouts.js";

function createMockServer(
	options: {
		capabilities?: unknown;
		result?: {
			action: "accept" | "decline" | "cancel";
			content?: { confirm: boolean };
		};
	} = {},
) {
	const tool = vi.fn();
	const capabilities = Object.hasOwn(options, "capabilities")
		? options.capabilities
		: { elicitation: { form: {} } };
	const elicitInput = vi
		.fn()
		.mockResolvedValue(
			options.result ?? { action: "accept", content: { confirm: true } },
		);
	const server = {
		tool,
		registerTool: tool,
		server: {
			getClientCapabilities: vi.fn(() => capabilities),
			elicitInput,
		},
	} as unknown as McpServer;
	return { elicitInput, server, tool };
}

function getToolRegistration(toolSpy: ReturnType<typeof vi.fn>, name: string) {
	const match = toolSpy.mock.calls.find(([toolName]) => toolName === name);
	if (!match) {
		throw new Error(`Tool ${name} was not registered`);
	}
	const handler = match.at(-1) as (args: Record<string, unknown>) => Promise<{
		content: Array<{ type: string; text: string }>;
		isError?: boolean;
		structuredContent?: Record<string, unknown>;
	}>;
	const config = match[1] as { outputSchema?: unknown } | undefined;
	return { outputSchema: config?.outputSchema, handler };
}

describe("registerWorkoutTools", () => {
	it("returns error responses when Hevy client is not initialized", async () => {
		const { server, tool } = createMockServer();
		registerWorkoutTools(server, null);

		const toolNames = [
			"get-workouts",
			"get-workout",
			"get-workout-count",
			"get-workout-events",
		];

		for (const name of toolNames) {
			const { handler } = getToolRegistration(tool, name);
			const response = await handler({});
			expect(response).toMatchObject({
				isError: true,
				content: [
					{
						type: "text",
						text: expect.stringContaining(
							"API client not initialized. Please provide HEVY_API_KEY.",
						),
					},
				],
			});
		}
	});

	it("get-workout-events returns error response on client failure", async () => {
		const { server, tool } = createMockServer();
		const hevyClient = {
			getWorkoutEvents: vi
				.fn()
				.mockRejectedValue(new Error("Workout events endpoint failed")),
		} as unknown as HevyClient;

		registerWorkoutTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-workout-events");

		const response = await handler({
			page: 1,
			pageSize: 5,
			since: "2025-01-01T00:00:00Z",
		});

		expect(hevyClient.getWorkoutEvents).toHaveBeenCalledWith({
			page: 1,
			pageSize: 5,
			since: "2025-01-01T00:00:00Z",
		});
		expect(response).toMatchObject({
			isError: true,
			content: [
				{
					type: "text",
					text: expect.stringContaining("The request failed unexpectedly"),
				},
			],
		});
	});

	it("get-workouts returns formatted workouts from the client", async () => {
		const { server, tool } = createMockServer();
		const workout: Workout = {
			id: "w1",
			title: "Morning Workout",
			description: "Great session",
			start_time: "2025-03-27T07:00:00Z",
			end_time: "2025-03-27T08:00:00Z",
			created_at: "2025-03-27T07:00:00Z",
			updated_at: "2025-03-27T07:10:00Z",
			exercises: [],
		};
		const hevyClient = {
			getWorkouts: vi.fn().mockResolvedValue({ workouts: [workout] }),
		} as unknown as HevyClient;

		registerWorkoutTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-workouts");

		const response = await handler({ page: 1, pageSize: 5 });

		expect(hevyClient.getWorkouts).toHaveBeenCalledWith({
			page: 1,
			pageSize: 5,
		});

		const parsed = JSON.parse(response.content[0].text) as unknown[];
		expect(parsed).toEqual([formatWorkout(workout)]);
		expect(response.structuredContent).toEqual({ workouts: parsed });
	});

	it("formats updated and deleted workout events from the client", async () => {
		const { server, tool } = createMockServer();
		const workout = {
			id: "w1",
			title: "Morning Workout",
			start_time: "2025-03-27T07:00:00Z",
			end_time: "2025-03-27T08:00:00Z",
			exercises: [
				{
					index: 0,
					title: "Bench Press",
					exercise_template_id: "bench-press",
					sets: [],
					muscle_group: "chest",
				},
			],
		};
		const hevyClient = {
			getWorkoutEvents: vi.fn().mockResolvedValue({
				events: [
					{ type: "updated", workout },
					{
						type: "deleted",
						id: "deleted-workout",
						deleted_at: "2025-03-28T07:00:00Z",
					},
				],
			}),
		} as unknown as HevyClient;

		registerWorkoutTools(server, hevyClient);
		const { handler, outputSchema } = getToolRegistration(
			tool,
			"get-workout-events",
		);

		const response = await handler({
			page: 1,
			pageSize: 5,
			since: "2025-01-01T00:00:00Z",
		});

		expect(response.structuredContent).toEqual({
			events: [
				{ type: "updated", workout: formatWorkout(workout) },
				{
					type: "deleted",
					id: "deleted-workout",
					deletedAt: "2025-03-28T07:00:00Z",
				},
			],
		});
		expect(response.structuredContent).not.toHaveProperty(
			"events.0.workout.exercises.0.muscle_group",
		);
		expect(outputSchema).toBe(workoutEventsOutputSchema);
		expect(() =>
			z.object(workoutEventsOutputSchema).parse(response.structuredContent),
		).not.toThrow();
	});

	it("rejects unsupported workout events without leaking payloads", async () => {
		const { server, tool } = createMockServer();
		const hevyClient = {
			getWorkoutEvents: vi.fn().mockResolvedValue({
				events: [
					{
						type: "mystery",
						id: "should-not-be-treated-as-deleted",
						secret: "sensitive-event-payload",
					},
				],
			}),
		} as unknown as HevyClient;

		registerWorkoutTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-workout-events");

		const response = await handler({
			page: 1,
			pageSize: 5,
			since: "2025-01-01T00:00:00Z",
		});
		const responseText = response.content[0]?.text ?? "";

		expect(response.isError).toBe(true);
		expect(response.structuredContent).toBeUndefined();
		expect(responseText).toContain("The request failed unexpectedly");
		expect(responseText).not.toContain("mystery");
		expect(responseText).not.toContain("should-not-be-treated-as-deleted");
		expect(responseText).not.toContain("sensitive-event-payload");
	});

	it("returns structured empty lists for workouts and events", async () => {
		const { server, tool } = createMockServer();
		const hevyClient = {
			getWorkouts: vi.fn().mockResolvedValue({ workouts: [] }),
			getWorkoutEvents: vi
				.fn()
				.mockResolvedValueOnce({ events: [] })
				.mockResolvedValueOnce({}),
		} as unknown as HevyClient;
		registerWorkoutTools(server, hevyClient);

		const workouts = await getToolRegistration(tool, "get-workouts").handler({
			page: 1,
			pageSize: 5,
		});
		const events = await getToolRegistration(
			tool,
			"get-workout-events",
		).handler({
			page: 1,
			pageSize: 5,
			since: "1970-01-01T00:00:00Z",
		});
		const eventsWithoutEvents = await getToolRegistration(
			tool,
			"get-workout-events",
		).handler({
			page: 1,
			pageSize: 5,
			since: "1970-01-01T00:00:00Z",
		});

		expect(workouts.structuredContent).toEqual({ workouts: [] });
		expect(events.structuredContent).toEqual({ events: [] });
		expect(eventsWithoutEvents.structuredContent).toEqual({ events: [] });
		expect(workouts.content[0]?.text).toBe(
			"No workouts found for the specified parameters",
		);
		expect(events.content[0]?.text).toBe(
			"No workout events found for the specified parameters since 1970-01-01T00:00:00Z",
		);
		expect(eventsWithoutEvents.content[0]?.text).toBe(
			"No workout events found for the specified parameters since 1970-01-01T00:00:00Z",
		);
	});

	it("get-workout returns an empty response when workout is not found", async () => {
		const { server, tool } = createMockServer();
		const hevyClient = {
			getWorkout: vi.fn().mockResolvedValue(null),
		} as unknown as HevyClient;

		registerWorkoutTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-workout");

		const response = await handler({ workoutId: "missing-id" });
		expect(hevyClient.getWorkout).toHaveBeenCalledWith("missing-id");
		expect(response.content[0]?.text).toBe(
			"Workout with ID missing-id not found",
		);
		expect(response.structuredContent).toEqual({ workout: null });
	});

	it("get-workout-count returns the numeric count from the client", async () => {
		const { server, tool } = createMockServer();
		const hevyClient = {
			getWorkoutCount: vi.fn().mockResolvedValue({ workout_count: 42 }),
		} as unknown as HevyClient;

		registerWorkoutTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-workout-count");

		const response = await handler({});
		expect(hevyClient.getWorkoutCount).toHaveBeenCalledTimes(1);

		const parsed = JSON.parse(response.content[0].text) as unknown;
		expect(parsed).toEqual({ count: 42 });
		expect(response.structuredContent).toEqual(parsed);
	});

	it("get-workout-count returns 0 when workout_count is undefined", async () => {
		const { server, tool } = createMockServer();
		const hevyClient = {
			getWorkoutCount: vi.fn().mockResolvedValue({}),
		} as unknown as HevyClient;

		registerWorkoutTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-workout-count");

		const response = await handler({});
		expect(hevyClient.getWorkoutCount).toHaveBeenCalledTimes(1);

		const parsed = JSON.parse(response.content[0].text) as unknown;
		expect(parsed).toEqual({ count: 0 });
	});

	it("get-workout-count returns 0 when data is null", async () => {
		const { server, tool } = createMockServer();
		const hevyClient = {
			getWorkoutCount: vi.fn().mockResolvedValue(null),
		} as unknown as HevyClient;

		registerWorkoutTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-workout-count");

		const response = await handler({});
		expect(hevyClient.getWorkoutCount).toHaveBeenCalledTimes(1);

		const parsed = JSON.parse(response.content[0].text) as unknown;
		expect(parsed).toEqual({ count: 0 });
	});

	it.each([
		["declined", { result: { action: "decline" as const } }],
		["canceled", { result: { action: "cancel" as const } }],
		["unsupported", { capabilities: {} }],
	])(
		"does not create or update workouts when confirmation is %s",
		async (_label, confirmation) => {
			const { server, tool } = createMockServer(confirmation);
			const createWorkout = vi.fn();
			const updateWorkout = vi.fn();
			const hevyClient = {
				createWorkout,
				updateWorkout,
			} as unknown as HevyClient;
			registerWorkoutTools(server, hevyClient, { confirmMutations: true });

			const workout = {
				title: "Guarded Workout",
				description: null,
				startTime: "2025-03-27T07:00:00Z",
				endTime: "2025-03-27T08:00:00Z",
				isPrivate: false,
				exercises: [],
			};
			await getToolRegistration(tool, "create-workout").handler(workout);
			await getToolRegistration(tool, "update-workout").handler({
				...workout,
				workoutId: "workout-1",
			});

			expect(createWorkout).not.toHaveBeenCalled();
			expect(updateWorkout).not.toHaveBeenCalled();
		},
	);

	it("update-workout continues after accepted confirmation", async () => {
		const { elicitInput, server, tool } = createMockServer();
		const updateResult: Workout = {
			id: "workout-1",
			title: "Updated Workout",
			description: "Updated description",
			start_time: "2025-03-27T09:00:00Z",
			end_time: "2025-03-27T10:00:00Z",
			created_at: "2025-03-27T07:00:00Z",
			updated_at: "2025-03-27T09:00:00Z",
			exercises: [],
		};
		const updateWorkout = vi.fn().mockResolvedValue(updateResult);
		const hevyClient = { updateWorkout } as unknown as HevyClient;
		registerWorkoutTools(server, hevyClient, { confirmMutations: true });

		const args = {
			workoutId: "workout-1",
			title: "Updated Workout",
			description: "Updated description",
			startTime: "2025-03-27T09:00:00Z",
			endTime: "2025-03-27T10:00:00Z",
			isPrivate: true,
			exercises: [
				{
					exerciseTemplateId: "template-id",
					supersetId: 2,
					notes: "Updated notes",
					sets: [
						{
							type: "normal" as const,
							weight: 85,
							reps: 6,
							distance: null,
							duration: null,
							rpe: 8,
							customMetric: null,
						},
					],
				},
			],
		};

		await getToolRegistration(tool, "update-workout").handler(args);

		expect(elicitInput).toHaveBeenCalledWith(
			expect.objectContaining({
				message:
					"Update workout workout-1 to 'Updated Workout' from 2025-03-27T09:00:00Z to 2025-03-27T10:00:00Z with 1 exercises?",
			}),
		);
		expect(updateWorkout).toHaveBeenCalledWith("workout-1", {
			workout: {
				title: "Updated Workout",
				description: "Updated description",
				start_time: "2025-03-27T09:00:00Z",
				end_time: "2025-03-27T10:00:00Z",
				is_private: true,
				exercises: [
					{
						exercise_template_id: "template-id",
						superset_id: 2,
						notes: "Updated notes",
						sets: [
							{
								type: "normal",
								weight_kg: 85,
								reps: 6,
								distance_meters: null,
								duration_seconds: null,
								rpe: 8,
								custom_metric: null,
							},
						],
					},
				],
			},
		});
	});

	it("create-workout maps arguments to the request body and formats the response", async () => {
		const { server, tool } = createMockServer({ capabilities: {} });
		const createResult: Workout = {
			id: "created-id",
			title: "New Workout",
			description: "New workout description",
			start_time: "2025-03-27T07:00:00Z",
			end_time: "2025-03-27T08:00:00Z",
			created_at: "2025-03-27T07:00:00Z",
			updated_at: "2025-03-27T07:00:00Z",
			exercises: [],
		};
		const hevyClient = {
			createWorkout: vi.fn().mockResolvedValue(createResult),
		} as unknown as HevyClient;

		registerWorkoutTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "create-workout");

		const args = {
			title: "New Workout",
			description: null,
			startTime: "2025-03-27T07:00:00Z",
			endTime: "2025-03-27T08:00:00Z",
			isPrivate: false,
			exercises: [
				{
					exerciseTemplateId: "template-id",
					supersetId: 1,
					notes: "Some notes",
					sets: [
						{
							type: "normal" as const,
							weight: 80,
							reps: 8,
							distance: null,
							duration: null,
							rpe: 7,
							customMetric: null,
						},
					],
				},
			],
		};

		const response = await handler(args as Record<string, unknown>);

		expect(hevyClient.createWorkout).toHaveBeenCalledWith({
			workout: {
				title: "New Workout",
				description: null,
				start_time: "2025-03-27T07:00:00Z",
				end_time: "2025-03-27T08:00:00Z",
				is_private: false,
				exercises: [
					{
						exercise_template_id: "template-id",
						superset_id: 1,
						notes: "Some notes",
						sets: [
							{
								type: "normal",
								weight_kg: 80,
								reps: 8,
								distance_meters: null,
								duration_seconds: null,
								rpe: 7,
								custom_metric: null,
							},
						],
					},
				],
			},
		});

		const parsed = JSON.parse(response.content[0].text) as unknown;
		expect(parsed).toEqual(formatWorkout(createResult));
	});

	it("create-workout does not send routine_id", async () => {
		const { server, tool } = createMockServer();
		const createResult: Workout = {
			id: "created-id",
			title: "Programmed Workout",
			description: undefined,
			start_time: "2025-03-27T07:00:00Z",
			end_time: "2025-03-27T08:00:00Z",
			created_at: "2025-03-27T07:00:00Z",
			updated_at: "2025-03-27T07:00:00Z",
			exercises: [],
		};
		const createWorkout = vi.fn().mockResolvedValue(createResult);
		const hevyClient = { createWorkout } as unknown as HevyClient;

		registerWorkoutTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "create-workout");

		const args = {
			title: "Programmed Workout",
			description: null,
			startTime: "2025-03-27T07:00:00Z",
			endTime: "2025-03-27T08:00:00Z",
			// routineId removed as it's not supported by the API schema
			isPrivate: false,
			exercises: [
				{
					exerciseTemplateId: "template-id",
					supersetId: null,
					notes: null,
					sets: [
						{
							type: "normal" as const,
							weightKg: 50,
							reps: 10,
						},
					],
				},
			],
		};

		await handler(args as Record<string, unknown>);

		expect(createWorkout).toHaveBeenCalledTimes(1);
		const [callArg] = createWorkout.mock.calls[0] ?? [];
		expect(callArg?.workout).not.toHaveProperty("routine_id");

		expect(createWorkout).toHaveBeenCalledWith({
			workout: {
				title: "Programmed Workout",
				description: null,
				start_time: "2025-03-27T07:00:00Z",
				end_time: "2025-03-27T08:00:00Z",
				is_private: false,
				exercises: [
					{
						exercise_template_id: "template-id",
						superset_id: null,
						notes: null,
						sets: [
							{
								type: "normal",
								weight_kg: 50,
								reps: 10,
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
	});
});
