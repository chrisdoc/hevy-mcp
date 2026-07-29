import type {
	BodyMeasurement,
	PostRoutinesRequestBody,
	PostRoutinesRequestSet,
	PostWorkoutsRequestBody,
	PostWorkoutsRequestSet,
	PutRoutinesRequestBody,
} from "@hevy-mcp/hevy-client/types";
import { z } from "zod";
import { parseJsonArray } from "../utils/json-parser.js";
import {
	equipmentCategoryEnum,
	exerciseTypeEnum,
	muscleGroupEnum,
	setTypeEnum,
	utcSecondTimestamp,
	zNullableInt,
	zNullableNumber,
	zStrictOptionalRepRange,
} from "../utils/schemas.js";

export interface PaginationShapeOptions {
	defaultPageSize: number;
	maxPageSize: number;
	integerPage?: boolean;
}

/** Build the page and page_size fields shared by paginated tools. */
export function paginationShape({
	defaultPageSize,
	maxPageSize,
	integerPage = true,
}: PaginationShapeOptions) {
	const pageNumber = z.coerce.number().gte(1);
	return {
		page: integerPage ? pageNumber.int() : pageNumber,
		page_size: z.coerce
			.number()
			.int()
			.gte(1)
			.lte(maxPageSize)
			.default(defaultPageSize),
	} as const;
}

export const nonEmptyId = z.string().min(1);

const exerciseTemplatePayloadShape = {
	title: z.string().min(1),
	exercise_type: exerciseTypeEnum,
	equipment_category: equipmentCategoryEnum,
	muscle_group: muscleGroupEnum,
	other_muscles: z.array(muscleGroupEnum).default([]),
} as const;

export const exerciseTemplateInputSchema = z.strictObject({
	exercise: z.strictObject(exerciseTemplatePayloadShape),
});
export const exerciseTemplateInputShape = exerciseTemplateInputSchema.shape;

const routineFolderPayloadShape = {
	title: z.string().min(1),
} as const;

export const routineFolderInputSchema = z.strictObject({
	routine_folder: z.strictObject(routineFolderPayloadShape),
});
export const routineFolderInputShape = routineFolderInputSchema.shape;

const CALENDAR_DATE_MESSAGE = "Date must be in YYYY-MM-DD format";
export const calendarDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, CALENDAR_DATE_MESSAGE)
	.refine((value) => {
		const parsed = new Date(`${value}T00:00:00.000Z`);
		return (
			!Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
		);
	}, CALENDAR_DATE_MESSAGE);

const rpeEnum = z.union([
	z.literal(6),
	z.literal(7),
	z.literal(7.5),
	z.literal(8),
	z.literal(8.5),
	z.literal(9),
	z.literal(9.5),
	z.literal(10),
]);

export const workoutSetShape = {
	type: setTypeEnum,
	weight_kg: z.coerce.number().optional().nullable(),
	reps: z.coerce.number().int().optional().nullable(),
	distance_meters: z.coerce.number().int().optional().nullable(),
	duration_seconds: z.coerce.number().int().optional().nullable(),
	rpe: rpeEnum.optional().nullable(),
	custom_metric: z.coerce.number().optional().nullable(),
} as const satisfies {
	[K in keyof PostWorkoutsRequestSet]: z.ZodTypeAny;
};

const workoutSetSchema = z.strictObject(workoutSetShape);
export const workoutExerciseShape = {
	exercise_template_id: nonEmptyId,
	superset_id: z.coerce.number().nullable().optional(),
	notes: z.string().optional().nullable(),
	sets: z.array(workoutSetSchema),
} as const satisfies {
	[K in keyof NonNullable<
		NonNullable<PostWorkoutsRequestBody["workout"]>["exercises"]
	>[number]]: z.ZodTypeAny;
};

const workoutExerciseSchema = z.strictObject(workoutExerciseShape);
export const workoutExercisesSchema = z.preprocess(
	parseJsonArray,
	z.array(workoutExerciseSchema),
);

export const replaceWorkoutPayloadShape = {
	title: z.string().min(1),
	description: z.string().optional().nullable(),
	start_time: utcSecondTimestamp,
	end_time: utcSecondTimestamp,
	is_private: z.boolean().default(false),
	exercises: workoutExercisesSchema,
} as const satisfies {
	[K in keyof NonNullable<PostWorkoutsRequestBody["workout"]>]: z.ZodTypeAny;
};

const replaceWorkoutPayloadSchema = z.strictObject(replaceWorkoutPayloadShape);
export const workoutInputSchema = z.strictObject({
	workout: replaceWorkoutPayloadSchema,
});
export const workoutInputShape = workoutInputSchema.shape;

export const replaceWorkoutInputSchema = z.strictObject({
	workout_id: nonEmptyId,
	workout: replaceWorkoutPayloadSchema,
});
export const replaceWorkoutInputShape = replaceWorkoutInputSchema.shape;

export const workoutMetadataPatchSchema = z
	.strictObject({
		title: z.string().min(1).optional(),
		description: z.string().nullable().optional(),
		start_time: utcSecondTimestamp.optional(),
		end_time: utcSecondTimestamp.optional(),
		is_private: z.boolean().optional(),
	})
	.refine(
		(patch) => Object.values(patch).some((value) => value !== undefined),
		"Include at least one workout metadata field",
	)
	.meta({ minProperties: 1 });

export const updateWorkoutInputSchema = z.strictObject({
	workout_id: nonEmptyId,
	workout: workoutMetadataPatchSchema,
});
export const updateWorkoutInputShape = updateWorkoutInputSchema.shape;

export const replaceWorkoutExercisesInputSchema = z.strictObject({
	workout_id: nonEmptyId,
	workout: z.strictObject({
		exercises: workoutExercisesSchema,
	}),
});
export const replaceWorkoutExercisesInputShape =
	replaceWorkoutExercisesInputSchema.shape;

export const routineSetShape = {
	type: setTypeEnum,
	weight_kg: z.coerce.number().optional(),
	reps: zNullableInt,
	distance_meters: z.coerce.number().int().optional(),
	duration_seconds: z.coerce.number().int().optional(),
	rep_range: zStrictOptionalRepRange,
	custom_metric: z.coerce.number().optional(),
} as const satisfies {
	[K in keyof PostRoutinesRequestSet]: z.ZodTypeAny;
};

const routineSetSchema = z.strictObject(routineSetShape);
export const routineExerciseShape = {
	exercise_template_id: nonEmptyId,
	superset_id: z.coerce.number().nullable().optional(),
	rest_seconds: z.coerce.number().int().min(0).optional(),
	notes: z.string().optional(),
	sets: z.array(routineSetSchema),
} as const satisfies {
	[K in keyof NonNullable<
		NonNullable<PostRoutinesRequestBody["routine"]>["exercises"]
	>[number]]: z.ZodTypeAny;
};

const routineExerciseSchema = z.strictObject(routineExerciseShape);

const routineExercisesSchema = z.preprocess(
	parseJsonArray,
	z.array(routineExerciseSchema),
);

export const routinePayloadShape = {
	title: z.string().min(1),
	folder_id: z.coerce.number().nullable().optional(),
	notes: z.string().optional(),
	exercises: routineExercisesSchema,
} as const satisfies {
	[K in keyof NonNullable<PostRoutinesRequestBody["routine"]>]: z.ZodTypeAny;
};

const routinePayloadSchema = z.strictObject(routinePayloadShape);
export const createRoutineInputSchema = z.strictObject({
	routine: routinePayloadSchema,
});
export const createRoutineInputShape = createRoutineInputSchema.shape;

const routineUpdatePayloadShape = {
	title: z.string().min(1),
	notes: z.string().optional(),
	exercises: routineExercisesSchema,
} as const satisfies {
	[K in keyof NonNullable<PutRoutinesRequestBody["routine"]>]: z.ZodTypeAny;
};

const routineUpdatePayloadSchema = z.strictObject(routineUpdatePayloadShape);
export const updateRoutineInputSchema = z.strictObject({
	routine_id: nonEmptyId,
	routine: routineUpdatePayloadSchema,
});
export const updateRoutineInputShape = updateRoutineInputSchema.shape;

export const bodyMeasurementFieldsSchema = {
	weight_kg: zNullableNumber,
	lean_mass_kg: zNullableNumber,
	fat_percent: zNullableNumber,
	neck_cm: zNullableNumber,
	shoulder_cm: zNullableNumber,
	chest_cm: zNullableNumber,
	left_bicep_cm: zNullableNumber,
	right_bicep_cm: zNullableNumber,
	left_forearm_cm: zNullableNumber,
	right_forearm_cm: zNullableNumber,
	abdomen: zNullableNumber.describe("Circumference in centimeters."),
	waist: zNullableNumber.describe("Circumference in centimeters."),
	hips: zNullableNumber.describe("Circumference in centimeters."),
	left_thigh: zNullableNumber,
	right_thigh: zNullableNumber,
	left_calf: zNullableNumber,
	right_calf: zNullableNumber,
} as const satisfies {
	[K in Exclude<keyof BodyMeasurement, "date">]: z.ZodTypeAny;
};

const bodyMeasurementFieldsObjectSchema = z.strictObject(
	bodyMeasurementFieldsSchema,
);
export const createBodyMeasurementInputSchema = z.strictObject({
	date: calendarDate,
	...bodyMeasurementFieldsSchema,
});
export const updateBodyMeasurementInputSchema = z.strictObject({
	date: calendarDate,
	...bodyMeasurementFieldsSchema,
});
export const createBodyMeasurementInputShape =
	createBodyMeasurementInputSchema.shape;
export const updateBodyMeasurementInputShape =
	updateBodyMeasurementInputSchema.shape;

export type WorkoutSetInput = z.infer<typeof workoutSetSchema>;
export type WorkoutExerciseInput = z.infer<typeof workoutExerciseSchema>;
export type WorkoutPayloadInput = z.infer<typeof replaceWorkoutPayloadSchema>;
export type WorkoutMetadataPatchInput = z.infer<
	typeof workoutMetadataPatchSchema
>;
export type RoutineSetInput = z.infer<typeof routineSetSchema>;
export type RoutineExerciseInput = z.infer<typeof routineExerciseSchema>;
export type RoutinePayloadInput = z.infer<typeof routinePayloadSchema>;
export type RoutineUpdatePayloadInput = z.infer<
	typeof routineUpdatePayloadSchema
>;
export type MeasurementFields = z.infer<
	typeof bodyMeasurementFieldsObjectSchema
>;
export type ExerciseTemplateInput = z.infer<typeof exerciseTemplateInputSchema>;
export type RoutineFolderInput = z.infer<typeof routineFolderInputSchema>;
