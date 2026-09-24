import { describe, expect, it } from "vitest";
import {
	calendarDate,
	createBodyMeasurementInputSchema,
	createRoutineInputSchema,
	equipmentCategoryEnum,
	exerciseTemplateInputSchema,
	exerciseTypeEnum,
	muscleGroupEnum,
	replaceWorkoutInputSchema,
	routineFolderInputSchema,
	routineExercisesSchema,
	setTypeEnum,
	updateBodyMeasurementInputSchema,
	updateRoutineInputSchema,
	utcSecondTimestamp,
	workoutInputSchema,
	zNullableInt,
	zNullableNumber,
	zOptionalRepRange,
	zStrictOptionalRepRange,
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

	it("keeps the shared routine exercises schema array-only", () => {
		expect(routineExercisesSchema.safeParse(routine.exercises).success).toBe(
			true,
		);
		expect(
			routineExercisesSchema.safeParse(JSON.stringify(routine.exercises))
				.success,
		).toBe(false);
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

describe("shared operation schema helpers", () => {
	it("normalizes nullable integer and number inputs", () => {
		expect(zNullableInt.parse(null)).toBeNull();
		expect(zNullableInt.parse(4)).toBe(4);
		expect(zNullableInt.parse(" 42 ")).toBe(42);
		expect(zNullableInt.parse("")).toBeUndefined();
		expect(zNullableInt.parse(" NULL ")).toBeNull();
		expect(zNullableInt.parse("undefined")).toBeUndefined();
		expect(zNullableInt.safeParse("not-a-number").success).toBe(false);

		expect(zNullableNumber.parse("")).toBeUndefined();
		expect(zNullableNumber.parse("3.5")).toBe(3.5);
		expect(zNullableNumber.parse(null)).toBeNull();
		expect(zNullableNumber.parse(undefined)).toBeUndefined();
	});

	it("normalizes optional repetition ranges and rejects unknown keys", () => {
		expect(zOptionalRepRange.parse(null)).toBeUndefined();
		expect(zOptionalRepRange.parse({ start: "5", end: " 8 " })).toEqual({
			start: 5,
			end: 8,
		});
		expect(
			zStrictOptionalRepRange.safeParse({ start: 5, end: 8, extra: true })
				.success,
		).toBe(false);
	});

	it("validates enum defaults and calendar date boundaries", () => {
		expect(setTypeEnum.parse(undefined)).toBe("normal");
		expect(setTypeEnum.parse("warmup")).toBe("warmup");
		expect(muscleGroupEnum.parse("chest")).toBe("chest");
		expect(exerciseTypeEnum.parse("weight_reps")).toBe("weight_reps");
		expect(equipmentCategoryEnum.parse("dumbbell")).toBe("dumbbell");
		expect(calendarDate.safeParse("2026-02-29").success).toBe(false);
		expect(calendarDate.safeParse("2026-07-16").success).toBe(true);
	});

	it("reports one issue for invalid UTC timestamps", () => {
		for (const value of [
			"2026-07-16T12:00Z",
			"2026-07-16T12:00:00+05:30",
			"2026-02-29T12:00:00Z",
		]) {
			const result = utcSecondTimestamp.safeParse(value);
			expect(result.success).toBe(false);
			if (!result.success) expect(result.error.issues).toHaveLength(1);
		}
	});
});
