import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import type { Workout } from "../generated/client/types/index.js";
import { formatWorkout } from "../utils/formatters.js";
import type { HevyClient } from "../utils/hevyClient.js";
import { registerWorkoutTools } from "./workouts.js";

function createMockServer() {
	const tool = vi.fn();
	const server = { tool } as unknown as McpServer;
	return { server, tool };
}

function getToolRegistration(toolSpy: ReturnType<typeof vi.fn>, name: string) {
	const match = toolSpy.mock.calls.find(([toolName]) => toolName === name);
	if (!match) {
		throw new Error(`Tool ${name} was not registered`);
	}
	const [, , , handler] = match as [
		string,
		string,
		Record<string, unknown>,
		(args: Record<string, unknown>) => Promise<{
			content: Array<{ type: string; text: string }>;
			isError?: boolean;
		}>,
	];
	return { handler };
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
			"create-workout",
			"update-workout",
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

	it("get-workouts returns formatted workouts from the client", async () => {
		const { server, tool } = createMockServer();
		const workout: Workout = {
			id: "w1",
			title: "Morning Workout",
			description: "Great session",
			start_time: 1711522800000,
			end_time: 1711526400000,
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
	});

	it("get-workout-count returns the numeric count from the client", async () => {
		const { server, tool } = createMockServer();
		const hevyClient = {
			getWorkoutCount: vi.fn().mockResolvedValue({ workoutCount: 42 }),
		} as unknown as HevyClient;

		registerWorkoutTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-workout-count");

		const response = await handler({});
		expect(hevyClient.getWorkoutCount).toHaveBeenCalledTimes(1);

		const parsed = JSON.parse(response.content[0].text) as unknown;
		expect(parsed).toEqual({ count: 42 });
	});

	it("create-workout maps arguments to the request body and formats the response", async () => {
		const { server, tool } = createMockServer();
		const createResult: Workout = {
			id: "created-id",
			title: "New Workout",
			description: "New workout description",
			start_time: 1711522800000,
			end_time: 1711526400000,
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
});
