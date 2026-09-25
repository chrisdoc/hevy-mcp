import type {
	BodyMeasurement,
	PostRoutinesRequestBody,
	PostWorkoutsRequestBody,
} from "@hevy-mcp/hevy-client/types";
import {
	bodyMeasurementFieldsSchema as domainBodyMeasurementFieldsSchema,
	calendarDate,
	exerciseTemplateInputFields,
	exerciseTemplateInputSchema,
	nonEmptyId,
	RPE_VALUES,
	routineExerciseFields,
	routineExerciseSchema,
	routineFolderInputFields,
	routineFolderInputSchema,
	routinePayloadFields as domainRoutinePayloadFields,
	routineSetFields,
	routineUpdatePayloadFields as domainRoutineUpdatePayloadFields,
	updateWorkoutInputFields,
	updateWorkoutInputSchema,
	workoutExerciseFields,
	workoutExerciseSchema,
	workoutMetadataPatchSchema,
	workoutSetFields,
	replaceWorkoutPayloadFields as domainWorkoutPayloadFields,
	zNullableInt,
	zNullableNumber,
	zStrictOptionalRepRange,
} from "@hevy-mcp/operations/schemas";
import { z } from "zod";
import { parseJsonArray } from "../protocol/json-parser.js";

export interface PaginationSchemaOptions {
	defaultPageSize: number;
	maxPageSize: number;
	integerPage?: boolean;
}

/** Build the page and page_size fields shared by paginated tools. */
export function paginationFields({
	defaultPageSize,
	maxPageSize,
	integerPage = true,
}: PaginationSchemaOptions) {
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

export {
	calendarDate,
	nonEmptyId,
	exerciseTemplateInputFields,
	exerciseTemplateInputSchema,
	RPE_VALUES,
	routineExerciseFields,
	routineFolderInputFields,
	routineFolderInputSchema,
	routineSetFields,
	updateWorkoutInputFields,
	updateWorkoutInputSchema,
	workoutExerciseFields,
	workoutMetadataPatchSchema,
	workoutSetFields,
};

export const workoutExercisesSchema = z.preprocess(
	parseJsonArray,
	z.array(workoutExerciseSchema),
);

export const replaceWorkoutPayloadFields = {
	...domainWorkoutPayloadFields,
	exercises: workoutExercisesSchema,
} as const satisfies {
	[K in keyof NonNullable<PostWorkoutsRequestBody["workout"]>]: z.ZodTypeAny;
};

const replaceWorkoutPayloadSchema = z.strictObject(replaceWorkoutPayloadFields);

export const workoutInputSchema = z.strictObject({
	workout: replaceWorkoutPayloadSchema,
});
export const workoutInputFields = workoutInputSchema.shape;

export const replaceWorkoutInputSchema = z.strictObject({
	workout_id: nonEmptyId,
	workout: replaceWorkoutPayloadSchema,
});
export const replaceWorkoutInputFields = replaceWorkoutInputSchema.shape;

export const replaceWorkoutExercisesInputSchema = z.strictObject({
	workout_id: nonEmptyId,
	workout: z.strictObject({
		is_private: z.boolean(),
		exercises: workoutExercisesSchema,
	}),
});
export const replaceWorkoutExercisesInputFields =
	replaceWorkoutExercisesInputSchema.shape;

const routineExercisesSchema = z
	.preprocess(
		parseJsonArray,
		z
			.array(routineExerciseSchema)
			.min(1, "A routine must contain at least one exercise"),
	)
	.nonoptional();

export const routinePayloadFields = {
	...domainRoutinePayloadFields,
	exercises: routineExercisesSchema,
} as const satisfies {
	[K in keyof NonNullable<PostRoutinesRequestBody["routine"]>]: z.ZodTypeAny;
};

const routinePayloadSchema = z.strictObject(routinePayloadFields);
export const createRoutineInputSchema = z.strictObject({
	routine: routinePayloadSchema,
});
export const createRoutineInputFields = createRoutineInputSchema.shape;

const legacyRoutineSetSchema = z.strictObject({
	type: routineSetFields.type.optional(),
	weight: zNullableNumber,
	weightKg: zNullableNumber,
	reps: zNullableInt.optional(),
	distance: zNullableInt,
	distanceMeters: zNullableInt,
	duration: zNullableInt,
	durationSeconds: zNullableInt,
	repRange: zStrictOptionalRepRange,
	customMetric: zNullableNumber,
});

const legacyCreateRoutineInputSchema = z.strictObject({
	title: z.string().min(1),
	folderId: z.coerce.number().nullable().optional(),
	notes: z.string().optional(),
	exercises: z
		.array(
			z.strictObject({
				exerciseTemplateId: nonEmptyId,
				supersetId: z.coerce.number().nullable().optional(),
				restSeconds: z.coerce.number().int().min(0).optional(),
				notes: z.string().optional(),
				sets: z.array(legacyRoutineSetSchema).min(1),
			}),
		)
		.min(1),
});

// Older MCP clients still send this flat camelCase shape. Keep its parser at
// the protocol boundary; Operations owns only the canonical mutation schema.
export const createRoutineInputParser = z.preprocess((input) => {
	const legacy = legacyCreateRoutineInputSchema.safeParse(input);
	if (!legacy.success) return input;
	const { title, folderId, notes, exercises } = legacy.data;
	return {
		routine: {
			title,
			folder_id: folderId,
			notes,
			exercises: exercises.map((exercise) => ({
				exercise_template_id: exercise.exerciseTemplateId,
				superset_id: exercise.supersetId,
				rest_seconds: exercise.restSeconds,
				notes: exercise.notes,
				sets: exercise.sets.map((set) => ({
					type: set.type ?? "normal",
					weight_kg: set.weightKg ?? set.weight ?? undefined,
					reps: set.reps,
					distance_meters: set.distanceMeters ?? set.distance ?? undefined,
					duration_seconds: set.durationSeconds ?? set.duration ?? undefined,
					rep_range: set.repRange,
					custom_metric: set.customMetric ?? undefined,
				})),
			})),
		},
	};
}, createRoutineInputSchema);

const routineUpdatePayloadSchema = z.strictObject({
	...domainRoutineUpdatePayloadFields,
	exercises: routineExercisesSchema,
});
export const updateRoutineInputSchema = z.strictObject({
	routine_id: nonEmptyId,
	routine: routineUpdatePayloadSchema,
});
export const updateRoutineInputFields = updateRoutineInputSchema.shape;

export const bodyMeasurementFieldsSchema = {
	...domainBodyMeasurementFieldsSchema,
	abdomen: domainBodyMeasurementFieldsSchema.abdomen.describe(
		"Circumference in centimeters.",
	),
	waist: domainBodyMeasurementFieldsSchema.waist.describe(
		"Circumference in centimeters.",
	),
	hips: domainBodyMeasurementFieldsSchema.hips.describe(
		"Circumference in centimeters.",
	),
} as const satisfies {
	[K in Exclude<keyof BodyMeasurement, "date">]: z.ZodTypeAny;
};

export const createBodyMeasurementInputSchema = z.strictObject({
	date: calendarDate,
	...bodyMeasurementFieldsSchema,
});
export const updateBodyMeasurementInputSchema = z.strictObject({
	date: calendarDate,
	...bodyMeasurementFieldsSchema,
});
export const createBodyMeasurementInputFields =
	createBodyMeasurementInputSchema.shape;
export const updateBodyMeasurementInputFields =
	updateBodyMeasurementInputSchema.shape;
export const bodyMeasurementFieldsInputSchema = z
	.strictObject(bodyMeasurementFieldsSchema)
	.describe("Measurement fields");

export type {
	ExerciseTemplateInput,
	MeasurementFields,
	RoutineExerciseInput,
	RoutineFolderInput,
	RoutinePayloadInput,
	RoutineSetInput,
	RoutineUpdatePayloadInput,
	WorkoutExerciseInput,
	WorkoutMetadataPatchInput,
	WorkoutPayloadInput,
	WorkoutSetInput,
} from "@hevy-mcp/operations/schemas";
