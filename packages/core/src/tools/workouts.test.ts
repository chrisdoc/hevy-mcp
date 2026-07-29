/* oxlint-disable typescript/unbound-method */
import type { McpServer } from "@modelcontextprotocol/server";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import { describe, expect, it, vi } from "vitest";
import { createToolRuntime } from "./tool-runtime.js";
import { registerToolDefinition } from "./define-tool.js";
import { workoutToolDefinitions } from "./workouts.js";

function register(client: HevyClient | null) {
	const tool = vi.fn();
	const server = { tool, registerTool: tool } as unknown as McpServer;
	const runtime = createToolRuntime({ client, catalog: {} as never });
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
	return call.at(-1) as (
		args: Record<string, unknown>,
	) => Promise<Record<string, unknown>>;
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
	it("exposes only generated-aligned snake_case input keys", async () => {
		const tool = register(null);
		const response = await toolHandler(
			tool,
			"get-workouts",
		)({ page: 2, page_size: 5 });
		expect(response).toMatchObject({ isError: true });
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
			getWorkoutCount: vi.fn().mockResolvedValue({ workout_count: 4 }),
		} as unknown as HevyClient;
		const tool = register(client);

		await toolHandler(tool, "get-workouts")({ page: 2, page_size: 5 });
		await toolHandler(tool, "get-workout")({ workout_id: "w1" });
		await toolHandler(
			tool,
			"get-workout-events",
		)({ page: 1, page_size: 5, since: "2025-01-01T00:00:00Z" });
		expect(await toolHandler(tool, "get-workout-count")({})).toMatchObject({
			structuredContent: { workout_count: 4 },
		});
		expect(client.getWorkouts).toHaveBeenCalledWith({ page: 2, pageSize: 5 });
		expect(client.getWorkout).toHaveBeenCalledWith("w1");
		expect(client.getWorkoutEvents).toHaveBeenCalledWith({
			page: 1,
			pageSize: 5,
			since: "2025-01-01T00:00:00Z",
		});
	});

	it("sends nested mutation bodies without casing adapters", async () => {
		const client = {
			createWorkout: vi
				.fn()
				.mockResolvedValue({ id: "w1", ...workoutInput.workout }),
			updateWorkout: vi
				.fn()
				.mockResolvedValue({ id: "w1", ...workoutInput.workout }),
		} as unknown as HevyClient;
		const tool = register(client);

		await toolHandler(tool, "create-workout")(workoutInput);
		await toolHandler(
			tool,
			"update-workout",
		)({ workout_id: "w1", ...workoutInput });
		expect(client.createWorkout).toHaveBeenCalledWith(
			expect.objectContaining({
				workout: expect.objectContaining({ title: "Push", is_private: false }),
			}),
		);
		expect(client.updateWorkout).toHaveBeenCalledWith(
			"w1",
			expect.objectContaining({
				workout: expect.objectContaining({ title: "Push", is_private: false }),
			}),
		);
	});
});
