/* oxlint-disable typescript/unbound-method */
import type { HevyClient } from "@hevy-mcp/hevy-client";
import { describe, expect, it, vi } from "vitest";
import type { CliArgs } from "../arguments.js";
import { execute } from "./index.js";

const args = (
	command: string,
	subcommand?: string,
	positionals: readonly string[] = [],
	options: CliArgs["options"] = {},
): CliArgs => ({ command, subcommand, positionals: [...positionals], options });

function client(): HevyClient {
	return {
		getUserInfo: vi.fn().mockResolvedValue({ user: { id: "u1" } }),
		getWorkouts: vi
			.fn()
			.mockResolvedValue({ page: 1, page_count: 1, workouts: [] }),
		getWorkout: vi.fn().mockResolvedValue({ workout: { id: "w1" } }),
		getWorkoutCount: vi.fn().mockResolvedValue({ workout_count: 4 }),
		getWorkoutEvents: vi
			.fn()
			.mockResolvedValue({ page: 1, page_count: 1, events: [] }),
		getRoutines: vi
			.fn()
			.mockResolvedValue({ page: 1, page_count: 1, routines: [] }),
		getRoutineById: vi.fn().mockResolvedValue({ routine: { id: "r1" } }),
		getExerciseTemplates: vi
			.fn()
			.mockResolvedValue({ page: 1, page_count: 1, exercise_templates: [] }),
		getExerciseTemplate: vi
			.fn()
			.mockResolvedValue({ exercise_template: { id: "e1" } }),
		getExerciseHistory: vi.fn().mockResolvedValue({ exercise_history: [] }),
		getBodyMeasurements: vi
			.fn()
			.mockResolvedValue({ page: 1, page_count: 1, body_measurements: [] }),
		getBodyMeasurement: vi
			.fn()
			.mockResolvedValue({ body_measurement: { date: "2024-01-01" } }),
		createWorkout: vi.fn(),
		updateWorkout: vi.fn(),
		createRoutine: vi.fn(),
		updateRoutine: vi.fn(),
		createExerciseTemplate: vi.fn(),
		getRoutineFolders: vi.fn(),
		createRoutineFolder: vi.fn(),
		getRoutineFolder: vi.fn(),
		createBodyMeasurement: vi.fn(),
		updateBodyMeasurement: vi.fn(),
	} as HevyClient;
}

describe("execute command/API mappings", () => {
	it.each([
		["user", undefined, [], "getUserInfo"],
		["workouts", "list", [], "getWorkouts"],
		["workouts", "get", ["w1"], "getWorkout"],
		["workouts", "count", [], "getWorkoutCount"],
		["workouts", "events", [], "getWorkoutEvents"],
		["routines", "list", [], "getRoutines"],
		["routines", "get", ["r1"], "getRoutineById"],
		["exercises", "get", ["e1"], "getExerciseTemplate"],
		["exercises", "history", ["e1"], "getExerciseHistory"],
		["exercises", "search", ["bench"], "getExerciseTemplates"],
		["measurements", "list", [], "getBodyMeasurements"],
		["measurements", "get", ["2024-01-01"], "getBodyMeasurement"],
	] as const)(
		"maps %s %s to %s",
		async (command, subcommand, positionals, method) => {
			const api = client();
			await execute(args(command, subcommand, positionals), api);
			expect(vi.mocked(api[method])).toHaveBeenCalled();
		},
	);

	it("passes validated options and identifiers to the client", async () => {
		const api = client();
		await execute(
			args("exercises", "history", [" e1 "], {
				"start-date": "2024-01-01T00:00:00Z",
			}),
			api,
		);
		expect(vi.mocked(api.getExerciseHistory)).toHaveBeenCalledWith("e1", {
			start_date: "2024-01-01T00:00:00Z",
		});
	});

	it("bounds exercise search and reports incomplete scans", async () => {
		const api = client();
		vi.mocked(api.getExerciseTemplates)
			.mockResolvedValueOnce({
				page: 1,
				page_count: 3,
				exercise_templates: [{ title: "Bench Press" }],
			})
			.mockResolvedValueOnce({
				page: 2,
				page_count: 3,
				exercise_templates: [],
			});
		const result = await execute(
			args("exercises", "search", ["bench"], { "max-pages": "2" }),
			api,
		);
		expect(result).toMatchObject({
			query: "bench",
			matches: [{ title: "Bench Press" }],
			pagesScanned: 2,
			complete: false,
		});
		expect(vi.mocked(api.getExerciseTemplates)).toHaveBeenNthCalledWith(1, {
			page: 1,
			pageSize: 100,
		});
		expect(vi.mocked(api.getExerciseTemplates)).toHaveBeenNthCalledWith(2, {
			page: 2,
			pageSize: 100,
		});
	});

	it("caps the default exercise search at ten pages", async () => {
		const api = client();
		vi.mocked(api.getExerciseTemplates).mockImplementation(async (params) => ({
			page: params?.page ?? 1,
			page_count: 11,
			exercise_templates: [],
		}));
		const result = await execute(args("exercises", "search", ["bench"]), api);
		expect(result).toMatchObject({ pagesScanned: 10, complete: false });
		expect(vi.mocked(api.getExerciseTemplates)).toHaveBeenCalledTimes(10);
	});

	it("rejects a mismatched page in an API response", async () => {
		const api = client();
		vi.mocked(api.getExerciseTemplates).mockResolvedValue({
			page: 2,
			page_count: 1,
			exercise_templates: [],
		});
		await expect(
			execute(args("exercises", "search", ["bench"]), api),
		).rejects.toThrow("invalid pagination metadata");
	});

	it("marks a date-boundary summary as complete", async () => {
		const api = client();
		vi.mocked(api.getWorkouts).mockResolvedValue({
			page: 1,
			page_count: 3,
			workouts: [
				{
					start_time: "2024-01-01T00:00:00Z",
					end_time: "2024-01-01T01:00:00Z",
					exercises: [],
				},
			],
		});
		const result = await execute(
			args("summary"),
			api,
			() => new Date("2024-02-01"),
		);
		expect(result).toMatchObject({ pagesScanned: 1, complete: true });
	});
});
