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
		fetch: async (input, init) => {
			const url = input instanceof Request ? input.url : String(input);
			const parsedUrl = new URL(url);
			const request = input instanceof Request ? input : new Request(url, init);
			const method = request.method.toUpperCase();
			const bodyText =
				method === "GET" || method === "HEAD"
					? undefined
					: await request.text();
			const body =
				bodyText === undefined || bodyText.length === 0
					? undefined
					: JSON.parse(bodyText);
			const jsonResponse = <T>(data: T | undefined) =>
				new Response(JSON.stringify(data ?? {}), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			const query =
				parsedUrl.search.length === 0
					? undefined
					: {
							page: Number(parsedUrl.searchParams.get("page")),
							pageSize: Number(parsedUrl.searchParams.get("pageSize")),
							since: parsedUrl.searchParams.get("since") ?? undefined,
						};
			switch (parsedUrl.pathname) {
				case "/v1/workouts": {
					if (method === "POST") {
						return jsonResponse(await methods.createWorkout(body));
					}
					if (method === "GET") {
						const params =
							query === undefined
								? undefined
								: ({
										page: query.page,
										pageSize: query.pageSize,
									} satisfies GetV1WorkoutsQuery);
						return jsonResponse(
							params === undefined
								? await methods.getWorkouts()
								: await methods.getWorkouts(params),
						);
					}
					break;
				}
				case "/v1/workouts/events": {
					return jsonResponse(
						await methods.getWorkoutEvents({
							page: query?.page,
							pageSize: query?.pageSize,
							since: query?.since,
						}),
					);
				}
				case "/v1/workouts/count": {
					return jsonResponse(await methods.getWorkoutCount());
				}
				case "/v1/routines": {
					if (method === "POST") {
						return jsonResponse(await methods.createRoutine(body));
					}
					if (method === "GET") {
						const params =
							query === undefined
								? undefined
								: ({
										page: query.page,
										pageSize: query.pageSize,
									} satisfies GetV1RoutinesQuery);
						return jsonResponse(
							params === undefined
								? await methods.getRoutines()
								: await methods.getRoutines(params),
						);
					}
					break;
				}
			}
			if (parsedUrl.pathname.startsWith("/v1/workouts/")) {
				const workoutId = decodeURIComponent(
					parsedUrl.pathname.slice("/v1/workouts/".length),
				);
				if (method === "PUT") {
					return jsonResponse(await methods.updateWorkout(workoutId, body));
				}
				return jsonResponse(await methods.getWorkout(workoutId));
			}
			if (parsedUrl.pathname.startsWith("/v1/routines/")) {
				const routineId = decodeURIComponent(
					parsedUrl.pathname.slice("/v1/routines/".length),
				);
				if (method === "PUT") {
					return jsonResponse(await methods.updateRoutine(routineId, body));
				}
				return jsonResponse(await methods.getRoutineById(routineId));
			}
			if (parsedUrl.pathname === "/v1/exercise_templates") {
				if (method === "POST") {
					return jsonResponse(await methods.createExerciseTemplate(body));
				}
				return jsonResponse(
					await methods.getExerciseTemplates({
						page: query?.page,
						pageSize: query?.pageSize,
					}),
				);
			}
			if (parsedUrl.pathname.startsWith("/v1/exercise_templates/")) {
				const exerciseTemplateId = decodeURIComponent(
					parsedUrl.pathname.slice("/v1/exercise_templates/".length),
				);
				return jsonResponse(
					await methods.getExerciseTemplate(exerciseTemplateId),
				);
			}
			if (parsedUrl.pathname.startsWith("/v1/exercise_history/")) {
				const exerciseTemplateId = decodeURIComponent(
					parsedUrl.pathname.slice("/v1/exercise_history/".length),
				);
				const historyQuery: Partial<Record<"start_date" | "end_date", string>> =
					{};
				const startDate = parsedUrl.searchParams.get("start_date");
				const endDate = parsedUrl.searchParams.get("end_date");
				if (startDate !== null) historyQuery.start_date = startDate;
				if (endDate !== null) historyQuery.end_date = endDate;
				return jsonResponse(
					await methods.getExerciseHistory(exerciseTemplateId, historyQuery),
				);
			}
			if (parsedUrl.pathname === "/v1/routine_folders") {
				if (method === "POST") {
					return jsonResponse(await methods.createRoutineFolder(body));
				}
				return jsonResponse(
					await methods.getRoutineFolders({
						page: query?.page,
						pageSize: query?.pageSize,
					}),
				);
			}
			if (parsedUrl.pathname.startsWith("/v1/routine_folders/")) {
				const folderId = decodeURIComponent(
					parsedUrl.pathname.slice("/v1/routine_folders/".length),
				);
				return jsonResponse(await methods.getRoutineFolder(folderId));
			}
			if (parsedUrl.pathname === "/v1/body_measurements") {
				if (method === "POST") {
					return jsonResponse(await methods.createBodyMeasurement(body));
				}
				return jsonResponse(
					await methods.getBodyMeasurements({
						page: query?.page,
						pageSize: query?.pageSize,
					}),
				);
			}
			if (parsedUrl.pathname.startsWith("/v1/body_measurements/")) {
				const date = decodeURIComponent(
					parsedUrl.pathname.slice("/v1/body_measurements/".length),
				);
				if (method === "PUT") {
					return jsonResponse(await methods.updateBodyMeasurement(date, body));
				}
				return jsonResponse(await methods.getBodyMeasurement(date));
			}
			if (parsedUrl.pathname === "/v1/user/info") {
				return jsonResponse(await methods.getUserInfo());
			}
			return new Response("{}", { status: 404 });
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
