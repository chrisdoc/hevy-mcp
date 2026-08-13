import type { McpServer } from "@modelcontextprotocol/server";
import { McpServer as Server } from "@modelcontextprotocol/server";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import { vi } from "vitest";

export function createMockHevyClient() {
	return {
		getWorkouts: vi.fn(),
		getWorkout: vi.fn(),
		createWorkout: vi.fn(),
		updateWorkout: vi.fn(),
		getWorkoutCount: vi.fn(),
		getWorkoutEvents: vi.fn(),
		getRoutines: vi.fn(),
		getRoutineById: vi.fn(),
		createRoutine: vi.fn(),
		updateRoutine: vi.fn(),
		getExerciseTemplates: vi.fn(),
		getExerciseTemplate: vi.fn(),
		getExerciseHistory: vi.fn(),
		createExerciseTemplate: vi.fn(),
		getRoutineFolders: vi.fn(),
		createRoutineFolder: vi.fn(),
		getRoutineFolder: vi.fn(),
		getBodyMeasurements: vi.fn(),
		getBodyMeasurement: vi.fn(),
		createBodyMeasurement: vi.fn(),
		updateBodyMeasurement: vi.fn(),
		getUserInfo: vi.fn(),
	} satisfies HevyClient;
}

export function createMockMcpServer() {
	const server = new Server({ name: "test-server", version: "0.0.0" });
	const registerTool = vi.spyOn(server, "registerTool");
	const registerResource = vi.spyOn(server, "registerResource");
	return { server, registerResource, registerTool } satisfies {
		server: McpServer;
		registerResource: typeof registerResource;
		registerTool: typeof registerTool;
	};
}
