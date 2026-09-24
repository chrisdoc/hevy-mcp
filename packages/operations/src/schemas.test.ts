import { describe, expect, it } from "vitest";
import {
	createBodyMeasurementInputSchema,
	createRoutineInputSchema,
	exerciseTemplateInputSchema,
	replaceWorkoutInputSchema,
	routineFolderInputSchema,
	updateBodyMeasurementInputSchema,
	updateRoutineInputSchema,
	workoutInputSchema,
} from "./schemas.js";

const workout = {
	title: "Push",
	start_time: "2026-07-29T08:00:00Z",
	end_time: "2026-07-29T09:00:00Z",
	exercises: [
		{
			exercise_template_id: "bench",
			sets: [{ type: "normal", weight_kg: "50", reps: "8", rpe: "8.5" }],
		},
	],
};

const routine = {
	title: "Push",
	folder_id: "3",
	exercises: [
		{
			exercise_template_id: "bench",
			sets: [{ reps: 8, rep_range: { start: 8, end: 12 } }],
		},
	],
};

describe("transport-neutral mutation schemas", () => {
	it("preserves workout required, optional, nullable, default, and coercion behavior", () => {
		const parsed = workoutInputSchema.parse({ workout });
		expect(parsed.workout.is_private).toBe(false);
		expect(parsed.workout.exercises[0]?.sets[0]).toMatchObject({
			weight_kg: 50,
			reps: 8,
			rpe: 8.5,
		});
		const nullableFields = workoutInputSchema.parse({
			workout: {
				...workout,
				description: null,
				exercises: [
					{
						exercise_template_id: "bench",
						sets: [{ type: "normal", weight_kg: null, reps: null }],
					},
				],
			},
		});
		expect(nullableFields.workout.description).toBeNull();
	});

	it("keeps workout dates and strict unknown-field rejection", () => {
		expect(
			workoutInputSchema.safeParse({
				workout: { ...workout, start_time: "2026-07-29T08:00Z" },
			}).success,
		).toBe(false);
		expect(
			workoutInputSchema.safeParse({
				workout: { ...workout, extra: true },
			}).success,
		).toBe(false);
		expect(
			workoutInputSchema.safeParse({
				workout: {
					...workout,
					exercises: [
						{
							exercise_template_id: "bench",
							sets: [{ type: "normal", weight_kg: 50, extra: true }],
						},
					],
				},
			}).success,
		).toBe(false);
	});

	it("accepts numeric and Gemini-compatible string RPE values but rejects out-of-range values", () => {
		for (const rpe of [8.5, "8.5"]) {
			const result = workoutInputSchema.parse({
				workout: {
					...workout,
					exercises: [
						{
							exercise_template_id: "bench",
							sets: [{ type: "normal", rpe }],
						},
					],
				},
			});
			expect(result.workout.exercises[0]?.sets[0]?.rpe).toBe(8.5);
		}
		expect(
			workoutInputSchema.safeParse({
				workout: {
					...workout,
					exercises: [
						{
							exercise_template_id: "bench",
							sets: [{ type: "normal", rpe: "5.5" }],
						},
					],
				},
			}).success,
		).toBe(false);
	});

	it("validates routine create and replacement inputs with defaults and rep ranges", () => {
		const parsed = createRoutineInputSchema.parse({ routine });
		expect(parsed.routine.folder_id).toBe(3);
		expect(parsed.routine.exercises[0]?.sets[0]?.type).toBe("normal");
		expect(parsed.routine.exercises[0]?.sets[0]?.rep_range).toEqual({
			start: 8,
			end: 12,
		});
		const routineUpdate = {
			title: routine.title,
			exercises: routine.exercises,
		};
		expect(
			updateRoutineInputSchema.safeParse({
				routine_id: "r1",
				routine: routineUpdate,
			}).success,
		).toBe(true);
		expect(
			updateRoutineInputSchema.safeParse({
				routine_id: "r1",
				routine: { ...routineUpdate, exercises: [] },
			}).success,
		).toBe(false);
		expect(
			replaceWorkoutInputSchema.safeParse({
				workout_id: "w1",
				workout: { ...workout, title: "Replaced" },
			}).success,
		).toBe(true);
	});

	it("validates measurement dates and nullable fields", () => {
		expect(
			createBodyMeasurementInputSchema.parse({
				date: "2026-07-29",
				weight_kg: "80",
				fat_percent: null,
			}),
		).toMatchObject({ weight_kg: 80, fat_percent: null });
		expect(
			updateBodyMeasurementInputSchema.safeParse({
				date: "2026-02-30",
				weight_kg: 80,
			}).success,
		).toBe(false);
		expect(
			createBodyMeasurementInputSchema.safeParse({
				date: "2026-07-29",
				weight_kg: 80,
				extra: true,
			}).success,
		).toBe(false);
	});

	it("keeps template and folder payload defaults and strict fields", () => {
		expect(
			exerciseTemplateInputSchema.parse({
				exercise: {
					title: "Cable Row",
					exercise_type: "weight_reps",
					equipment_category: "machine",
					muscle_group: "upper_back",
				},
			}),
		).toMatchObject({ exercise: { other_muscles: [] } });
		expect(
			routineFolderInputSchema.safeParse({
				routine_folder: { title: "Strength", extra: true },
			}).success,
		).toBe(false);
	});
});
