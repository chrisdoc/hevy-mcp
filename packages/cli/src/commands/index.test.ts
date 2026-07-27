/* oxlint-disable typescript/unbound-method */
import type { HevyClient } from "@hevy-mcp/hevy-client";
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

	it("dispatches every create/update route with normalized envelopes", async () => {
		const api = client();
		const workout = {
			title: "Push",
			startTime: "2024-01-01T10:00:00Z",
			endTime: "2024-01-01T11:00:00Z",
			exercises: [
				{
					exerciseTemplateId: "exercise-1",
					sets: [{ type: "normal", weightKg: 50, reps: 5 }],
				},
			],
		};
		const routine = {
			title: "Strength",
			exercises: [
				{
					exerciseTemplateId: "exercise-1",
					sets: [{ type: "normal", reps: 5 }],
				},
			],
		};
		const options = (data: unknown): CliArgs["options"] => ({
			data: JSON.stringify(data),
			yes: true,
		});

		vi.mocked(api.createWorkout).mockResolvedValue({ id: "workout-1" });
		vi.mocked(api.updateWorkout).mockResolvedValue({ id: "workout-1" });
		vi.mocked(api.createRoutine).mockResolvedValue({ id: "routine-1" });
		vi.mocked(api.updateRoutine).mockResolvedValue({ id: "routine-1" });
		vi.mocked(api.createExerciseTemplate).mockResolvedValue({
			id: 2,
		});
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

		expect(
			await execute(args("workouts", "create", [], options(workout)), api),
		).toEqual({ workout: { id: "workout-1" } });
		expect(
			await execute(
				args("workouts", "update", ["workout-1"], options(workout)),
				api,
			),
		).toEqual({ workoutId: "workout-1", workout: { id: "workout-1" } });
		expect(
			await execute(args("routines", "create", [], options(routine)), api),
		).toEqual({
			routine: { id: "routine-1" },
			usesRepRanges: false,
		});
		expect(
			await execute(
				args("routines", "update", ["routine-1"], options(routine)),
				api,
			),
		).toEqual({
			routineId: "routine-1",
			routine: { id: "routine-1" },
			usesRepRanges: false,
		});
		expect(
			await execute(
				args(
					"exercises",
					"create",
					[],
					options({
						title: "Cable Row",
						exerciseType: "weight_reps",
						equipmentCategory: "machine",
						muscleGroup: "upper_back",
					}),
				),
				api,
			),
		).toEqual({ exerciseTemplate: { id: 2 } });
		expect(
			await execute(
				args("folders", "create", [], options({ name: "Strength" })),
				api,
			),
		).toEqual({ folder: { id: 3 } });
		expect(
			await execute(
				args(
					"measurements",
					"create",
					["2024-01-02"],
					options({ weightKg: 80 }),
				),
				api,
			),
		).toEqual({ measurement: { date: "2024-01-02", weightKg: 80 } });
		expect(
			await execute(
				args(
					"measurements",
					"update",
					["2024-01-02"],
					options({ weightKg: 81, fatPercent: null }),
				),
				api,
			),
		).toEqual({
			measurement: {
				date: "2024-01-02",
				weightKg: 81,
				fatPercent: null,
				neckCm: 40,
			},
		});

		expect(api.createWorkout).toHaveBeenCalledWith({
			workout: {
				title: "Push",
				description: null,
				start_time: "2024-01-01T10:00:00Z",
				end_time: "2024-01-01T11:00:00Z",
				is_private: false,
				exercises: [
					{
						exercise_template_id: "exercise-1",
						superset_id: null,
						notes: null,
						sets: [
							{
								type: "normal",
								weight_kg: 50,
								reps: 5,
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
		expect(api.createRoutine).toHaveBeenCalledWith({
			routine: {
				title: "Strength",
				folder_id: null,
				notes: "",
				exercises: [
					{
						exercise_template_id: "exercise-1",
						superset_id: null,
						rest_seconds: null,
						notes: null,
						sets: [
							{
								type: "normal",
								weight_kg: null,
								reps: 5,
								distance_meters: null,
								duration_seconds: null,
								custom_metric: null,
								rep_range: null,
							},
						],
					},
				],
			},
		});
		expect(api.updateRoutine).toHaveBeenCalledWith("routine-1", {
			routine: {
				title: "Strength",
				notes: null,
				exercises: [
					{
						exercise_template_id: "exercise-1",
						superset_id: null,
						rest_seconds: null,
						notes: null,
						sets: [
							{
								type: "normal",
								weight_kg: null,
								reps: 5,
								distance_meters: null,
								duration_seconds: null,
								custom_metric: null,
							},
						],
					},
				],
			},
		});
		expect(api.createExerciseTemplate).toHaveBeenCalledWith({
			exercise: {
				title: "Cable Row",
				exercise_type: "weight_reps",
				equipment_category: "machine",
				muscle_group: "upper_back",
				other_muscles: [],
			},
		});
		expect(api.createRoutineFolder).toHaveBeenCalledWith({
			routine_folder: { title: "Strength" },
		});
		expect(api.createBodyMeasurement).toHaveBeenCalledWith({
			date: "2024-01-02",
			weight_kg: 80,
		});
		expect(api.getBodyMeasurement).toHaveBeenCalledWith("2024-01-02");
		expect(api.updateBodyMeasurement).toHaveBeenCalledWith("2024-01-02", {
			weight_kg: 81,
			neck_cm: 40,
		});
		expect(vi.mocked(api.createWorkout)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(api.updateWorkout)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(api.createRoutine)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(api.updateRoutine)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(api.createExerciseTemplate)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(api.createRoutineFolder)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(api.createBodyMeasurement)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(api.updateBodyMeasurement)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(api.getBodyMeasurement)).toHaveBeenCalledTimes(1);
	});

	it.each([
		{ response: { date: "2024-01-02", unexpected: true } },
		{ response: { date: "2024-01-03", weight_kg: 80 } },
	])(
		"rejects invalid existing measurements without PUT",
		async ({ response }) => {
			const api = client();
			vi.mocked(api.getBodyMeasurement).mockResolvedValue(response);
			await expect(
				execute(
					args("measurements", "update", ["2024-01-02"], {
						data: JSON.stringify({ weightKg: 81 }),
						yes: true,
					}),
					api,
				),
			).rejects.toThrow(
				new ApiResponseError("The API returned an invalid body measurement"),
			);
			expect(vi.mocked(api.updateBodyMeasurement)).not.toHaveBeenCalled();
		},
	);
});
