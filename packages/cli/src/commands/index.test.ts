/* oxlint-disable typescript/unbound-method */
import type { HevyClient } from "@hevy-mcp/hevy-client";
import type { HevyOperations } from "@hevy-mcp/operations";
import { describe, expect, it, vi } from "vitest";
import type { CliArgs } from "../arguments.js";
import { ApiResponseError } from "../errors.js";
import { execute } from "./index.js";

const args = (
	command: string,
	subcommand?: string,
	positionals: readonly string[] = [],
	options: CliArgs["options"] = {},
): CliArgs => ({ command, subcommand, positionals: [...positionals], options });

function client(): HevyClient {
	return {
		getUserInfo: vi.fn().mockResolvedValue({ id: "u1" }),
		getWorkouts: vi
			.fn()
			.mockResolvedValue({ page: 1, page_count: 1, workouts: [] }),
		getWorkout: vi.fn().mockResolvedValue({ id: "w1" }),
		getWorkoutCount: vi.fn().mockResolvedValue({ workout_count: 4 }),
		getWorkoutEvents: vi
			.fn()
			.mockResolvedValue({ page: 1, page_count: 1, events: [] }),
		getRoutines: vi
			.fn()
			.mockResolvedValue({ page: 1, page_count: 1, routines: [] }),
		getRoutineById: vi.fn().mockResolvedValue({ id: "r1" }),
		getExerciseTemplates: vi
			.fn()
			.mockResolvedValue({ page: 1, page_count: 1, exercise_templates: [] }),
		getExerciseTemplate: vi.fn().mockResolvedValue({ id: "e1" }),
		getExerciseHistory: vi.fn().mockResolvedValue({ exercise_history: [] }),
		getBodyMeasurements: vi
			.fn()
			.mockResolvedValue({ page: 1, page_count: 1, body_measurements: [] }),
		getBodyMeasurement: vi.fn().mockResolvedValue({ date: "2024-01-01" }),
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

const workout = {
	workout: {
		title: "Push",
		start_time: "2024-01-01T10:00:00Z",
		end_time: "2024-01-01T11:00:00Z",
		exercises: [
			{
				exercise_template_id: "exercise-1",
				sets: [{ type: "normal", weight_kg: 50, reps: 5 }],
			},
		],
	},
};
const routine = {
	routine: {
		title: "Strength",
		exercises: [
			{
				exercise_template_id: "exercise-1",
				sets: [{ type: "normal", reps: 5 }],
			},
		],
	},
};
const options = (data: unknown): CliArgs["options"] => ({
	data: JSON.stringify(data),
	yes: true,
});

describe("execute command/API mappings", () => {
	it("uses the injected routines list operation while retaining the page envelope", async () => {
		const api = client();
		const executeList = vi.fn().mockResolvedValue({
			items: [{ id: "r1", title: "Push", exercises: [] }],
			page: 2,
			pageCount: 3,
		});
		const operations = {
			routines: { list: { execute: executeList } },
		} as unknown as HevyOperations;

		await expect(
			execute(
				args("routines", "list", [], { page: "2" }),
				api,
				undefined,
				undefined,
				operations,
			),
		).resolves.toEqual({
			page: 2,
			page_count: 3,
			routines: [{ id: "r1", title: "Push", exercises: [] }],
		});
		expect(executeList).toHaveBeenCalledWith({ page: 2, pageSize: 5 });
		expect(api.getRoutines).not.toHaveBeenCalled();

		executeList.mockResolvedValue({
			items: [],
			page: 2,
			pageCount: undefined,
			expected404Outcome: "end_of_list",
		});
		await expect(
			execute(
				args("routines", "list", [], { page: "2" }),
				api,
				undefined,
				undefined,
				operations,
			),
		).resolves.toEqual({ page: 2, page_count: 0, routines: [] });
	});

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

	it.each([undefined, -1, 1.5, "4"])(
		"rejects an invalid workout count %p",
		async (workoutCount) => {
			const api = client();
			vi.mocked(api.getWorkoutCount).mockResolvedValue({
				workout_count: workoutCount,
			} as never);

			await expect(execute(args("workouts", "count"), api)).rejects.toThrow(
				ApiResponseError,
			);
		},
	);

	it("emits snake_case search and summary projections", async () => {
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
			pages_scanned: 2,
			complete: false,
		});
		expect(vi.mocked(api.getExerciseTemplates)).toHaveBeenNthCalledWith(1, {
			page: 1,
			pageSize: 100,
		});

		vi.mocked(api.getWorkouts).mockResolvedValue({
			page: 1,
			page_count: 1,
			workouts: [
				{
					start_time: "2024-01-01T00:00:00Z",
					end_time: "2024-01-01T01:00:00Z",
					exercises: [],
				},
			],
		});
		const summary = await execute(
			args("summary"),
			api,
			() => new Date("2024-02-01"),
		);
		expect(summary).toMatchObject({ pages_scanned: 1, complete: true });
	});

	it("forwards API-shaped mutation envelopes unchanged", async () => {
		const api = client();
		vi.mocked(api.createWorkout).mockResolvedValue({ id: "workout-1" });
		vi.mocked(api.updateWorkout).mockResolvedValue({ id: "workout-1" });
		vi.mocked(api.createRoutine).mockResolvedValue({ id: "routine-1" });
		vi.mocked(api.updateRoutine).mockResolvedValue({ id: "routine-1" });
		vi.mocked(api.createExerciseTemplate).mockResolvedValue({ id: 2 });
		vi.mocked(api.createRoutineFolder).mockResolvedValue({ id: 3 });
		vi.mocked(api.createBodyMeasurement).mockResolvedValue({
			date: "2024-01-02",
			weight_kg: 80,
		});
		vi.mocked(api.updateBodyMeasurement).mockResolvedValue({
			date: "2024-01-02",
			weight_kg: 81,
		});
		vi.mocked(api.getBodyMeasurement).mockResolvedValue({
			date: "2024-01-02",
			weight_kg: 80,
			fat_percent: 20,
			neck_cm: 40,
		});

		await execute(args("workouts", "create", [], options(workout)), api);
		await execute(
			args(
				"workouts",
				"update",
				["workout-1"],
				options({ workout_id: "workout-1", ...workout }),
			),
			api,
		);
		await execute(args("routines", "create", [], options(routine)), api);
		await execute(
			args(
				"routines",
				"update",
				["routine-1"],
				options({ routine_id: "routine-1", ...routine }),
			),
			api,
		);
		await execute(
			args(
				"exercises",
				"create",
				[],
				options({
					exercise: {
						title: "Cable Row",
						exercise_type: "weight_reps",
						equipment_category: "machine",
						muscle_group: "upper_back",
					},
				}),
			),
			api,
		);
		await execute(
			args(
				"folders",
				"create",
				[],
				options({ routine_folder: { title: "Strength" } }),
			),
			api,
		);
		await execute(
			args(
				"measurements",
				"create",
				["2024-01-02"],
				options({ date: "2024-01-02", weight_kg: 80 }),
			),
			api,
		);
		await execute(
			args(
				"measurements",
				"update",
				["2024-01-02"],
				options({ date: "2024-01-02", weight_kg: 81, fat_percent: null }),
			),
			api,
		);

		expect(api.createWorkout).toHaveBeenCalledWith({
			workout: expect.objectContaining({
				title: "Push",
				start_time: workout.workout.start_time,
			}),
		});
		expect(api.updateWorkout).toHaveBeenCalledWith("workout-1", {
			workout: expect.objectContaining({
				start_time: workout.workout.start_time,
			}),
		});
		expect(api.createRoutine).toHaveBeenCalledWith({
			routine: expect.objectContaining({ title: "Strength" }),
		});
		expect(api.createExerciseTemplate).toHaveBeenCalledWith({
			exercise: expect.objectContaining({ exercise_type: "weight_reps" }),
		});
		expect(api.createRoutineFolder).toHaveBeenCalledWith({
			routine_folder: { title: "Strength" },
		});
		expect(api.createBodyMeasurement).toHaveBeenCalledWith({
			date: "2024-01-02",
			weight_kg: 80,
		});
		expect(api.updateBodyMeasurement).toHaveBeenCalledWith("2024-01-02", {
			weight_kg: 81,
			neck_cm: 40,
		});
	});

	it("rejects invalid existing measurements without PUT", async () => {
		const api = client();
		vi.mocked(api.getBodyMeasurement).mockResolvedValue({
			date: "2024-01-03",
			weight_kg: 80,
		});
		await expect(
			execute(
				args("measurements", "update", ["2024-01-02"], {
					data: JSON.stringify({ date: "2024-01-02", weight_kg: 81 }),
					yes: true,
				}),
				api,
			),
		).rejects.toThrow(
			new ApiResponseError("The API returned an invalid body measurement"),
		);
		expect(api.updateBodyMeasurement).not.toHaveBeenCalled();
	});
});
