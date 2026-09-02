import type { McpServer } from "@modelcontextprotocol/server";
import { McpServer as Server } from "@modelcontextprotocol/server";
import { createHevyClient, type HevyClient } from "@hevy-mcp/hevy-client";
import type {
	GetV1RoutinesQuery,
	GetV1WorkoutsQuery,
} from "@hevy-mcp/hevy-client/types";
import { vi } from "vitest";

export function createMockHevyClient() {
	const methods = {
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

	const client = createHevyClient({
		apiKey: "test-key",
		maxGetRetries: 0,
		fetch: async (input) => {
			const url = input instanceof Request ? input.url : String(input);
			const parsedUrl = new URL(url);
			switch (parsedUrl.pathname) {
				case "/v1/workouts": {
					const query =
						parsedUrl.search.length === 0
							? undefined
							: ({
									page: Number(parsedUrl.searchParams.get("page")),
									pageSize: Number(parsedUrl.searchParams.get("pageSize")),
								} satisfies GetV1WorkoutsQuery);
					const data =
						query === undefined
							? await methods.getWorkouts()
							: await methods.getWorkouts(query);
					return new Response(JSON.stringify(data ?? {}), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				default:
					break;
			}
			if (parsedUrl.pathname.startsWith("/v1/workouts/")) {
				const workoutId = decodeURIComponent(
					parsedUrl.pathname.slice("/v1/workouts/".length),
				);
				const data = await methods.getWorkout(workoutId);
				return new Response(JSON.stringify(data ?? {}), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			if (parsedUrl.pathname.startsWith("/v1/routines/")) {
				const routineId = decodeURIComponent(
					parsedUrl.pathname.slice("/v1/routines/".length),
				);
				const data = await methods.getRoutineById(routineId);
				return new Response(JSON.stringify(data ?? {}), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			switch (parsedUrl.pathname) {
				case "/v1/routines": {
					const query =
						parsedUrl.search.length === 0
							? undefined
							: ({
									page: Number(parsedUrl.searchParams.get("page")),
									pageSize: Number(parsedUrl.searchParams.get("pageSize")),
								} satisfies GetV1RoutinesQuery);
					const data =
						query === undefined
							? await methods.getRoutines()
							: await methods.getRoutines(query);
					return new Response(JSON.stringify(data ?? {}), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				default:
					return new Response("{}", { status: 404 });
			}
		},
	});
	Object.assign(client, methods);
	return client as HevyClient & typeof methods;
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
