import type {
	BodyMeasurement,
	PostRoutinesRequestBody,
	PostRoutinesRequestSet,
	PostWorkoutsRequestBody,
	PostWorkoutsRequestSet,
	PostWorkoutsRequestSetRpeEnumKey,
	PutRoutinesRequestBody,
} from "@hevy-mcp/hevy-client/types";
import { z } from "zod";

const stringInputSchema = z.string();
const finiteNumberInputSchema = z.number().finite();

function coerceNullishNumberInput<T>(value: T): T | number | null | undefined {
	if (value === null || value === undefined) return value;
	const parsedString = stringInputSchema.safeParse(value);
	if (!parsedString.success) return value;
	const trimmed = parsedString.data.trim();
	if (trimmed === "") return undefined;
	const lowered = trimmed.toLowerCase();
	if (lowered === "null") return null;
	if (lowered === "undefined") return undefined;
	const asNumber = Number(trimmed);
	return Number.isNaN(asNumber) ? value : asNumber;
}

function normalizeRpeInput<T>(value: T): T | string {
	const parsedNumber = finiteNumberInputSchema.safeParse(value);
	return parsedNumber.success ? String(parsedNumber.data) : value;
}

export const zNullableInt = z.preprocess(
	coerceNullishNumberInput,
	z.number().int().nullable().optional(),
);

export const zNullableNumber = z.preprocess(
	(value) => (value === "" ? undefined : value),
	z.coerce.number().nullable().optional(),
);

const repRangeFields = {
	start: zNullableInt,
	end: zNullableInt,
} as const;

function optionalRepRangeSchema<T extends z.ZodType>(schema: T) {
	return z.preprocess((value) => (value === null ? undefined : value), schema);
}

export const zOptionalRepRange = optionalRepRangeSchema(
	z.object(repRangeFields).optional(),
);

export const zStrictOptionalRepRange = optionalRepRangeSchema(
	z.object(repRangeFields).strict().optional(),
);

export const setTypeEnum = z
	.enum(["warmup", "normal", "failure", "dropset"])
	.default("normal");

export const muscleGroupEnum = z.enum([
	"abdominals",
	"shoulders",
	"biceps",
	"triceps",
	"forearms",
	"quadriceps",
	"hamstrings",
	"calves",
	"glutes",
	"abductors",
	"adductors",
	"lats",
	"upper_back",
	"traps",
	"lower_back",
	"chest",
	"cardio",
	"neck",
	"full_body",
	"other",
]);

export const exerciseTypeEnum = z.enum([
	"weight_reps",
	"reps_only",
	"bodyweight_reps",
	"bodyweight_assisted_reps",
	"duration",
	"weight_duration",
	"distance_duration",
	"short_distance_weight",
]);

export const equipmentCategoryEnum = z.enum([
	"none",
	"barbell",
	"dumbbell",
	"kettlebell",
	"machine",
	"plate",
	"resistance_band",
	"suspension",
	"other",
]);

const UTC_TIMESTAMP_MESSAGE = "Must use the UTC format YYYY-MM-DDTHH:mm:ssZ";
const UTC_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export const utcSecondTimestamp = z
	.string()
	.regex(UTC_TIMESTAMP_REGEX, UTC_TIMESTAMP_MESSAGE)
	.pipe(
		z.string().refine((value) => {
			const parsed = new Date(value);
			return (
				!Number.isNaN(parsed.getTime()) &&
				parsed.toISOString().replace(".000Z", "Z") === value
			);
		}, UTC_TIMESTAMP_MESSAGE),
	);

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

export const nonEmptyId = z.string().min(1);

const exerciseTemplatePayloadFields = {
	title: z.string().min(1),
	exercise_type: exerciseTypeEnum,
	equipment_category: equipmentCategoryEnum,
	muscle_group: muscleGroupEnum,
	other_muscles: z.array(muscleGroupEnum).default([]),
} as const;

export const exerciseTemplateInputSchema = z.strictObject({
	exercise: z.strictObject(exerciseTemplatePayloadFields),
});
export const exerciseTemplateInputFields = exerciseTemplateInputSchema.shape;

export const routineFolderInputSchema = z.strictObject({
	routine_folder: z.strictObject({ title: z.string().min(1) }),
});
export const routineFolderInputFields = routineFolderInputSchema.shape;

export const RPE_VALUES = [
	"6",
	"7",
	"7.5",
	"8",
	"8.5",
	"9",
	"9.5",
	"10",
] as const;

export type RpeStringValue = (typeof RPE_VALUES)[number];

const rpeEnum = z
	.preprocess(normalizeRpeInput, z.enum(RPE_VALUES))
	.transform((value) => Number(value) as PostWorkoutsRequestSetRpeEnumKey);

export const workoutSetFields = {
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

export const workoutSetSchema = z.strictObject(workoutSetFields);
export const workoutExerciseFields = {
	exercise_template_id: nonEmptyId,
	superset_id: z.coerce.number().nullable().optional(),
	notes: z.string().optional().nullable(),
	sets: z.array(workoutSetSchema),
} as const satisfies {
	[
		K in keyof NonNullable<
			NonNullable<PostWorkoutsRequestBody["workout"]>["exercises"]
		>[number]
	]: z.ZodTypeAny;
};

export const workoutExerciseSchema = z.strictObject(workoutExerciseFields);
export const workoutExercisesSchema = z.array(workoutExerciseSchema);

export const replaceWorkoutPayloadFields = {
	title: z.string().min(1),
	description: z.string().optional().nullable(),
	start_time: utcSecondTimestamp,
	end_time: utcSecondTimestamp,
	is_private: z.boolean().default(false),
	exercises: workoutExercisesSchema,
} as const satisfies {
	[K in keyof NonNullable<PostWorkoutsRequestBody["workout"]>]: z.ZodTypeAny;
};

export const replaceWorkoutPayloadSchema = z.strictObject(
	replaceWorkoutPayloadFields,
);
export const workoutInputSchema = z.strictObject({
	workout: replaceWorkoutPayloadSchema,
});
export const workoutInputFields = workoutInputSchema.shape;

export const replaceWorkoutInputSchema = z.strictObject({
	workout_id: nonEmptyId,
	workout: replaceWorkoutPayloadSchema,
});
export const replaceWorkoutInputFields = replaceWorkoutInputSchema.shape;

export const workoutMetadataPatchSchema = z
	.strictObject({
		title: z.string().min(1).optional(),
		description: z.string().nullable().optional(),
		start_time: utcSecondTimestamp.optional(),
		end_time: utcSecondTimestamp.optional(),
		is_private: z.boolean(),
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
export const updateWorkoutInputFields = updateWorkoutInputSchema.shape;

export const replaceWorkoutExercisesInputSchema = z.strictObject({
	workout_id: nonEmptyId,
	workout: z.strictObject({
		is_private: z.boolean(),
		exercises: workoutExercisesSchema,
	}),
});
export const replaceWorkoutExercisesInputFields =
	replaceWorkoutExercisesInputSchema.shape;

export const routineSetFields = {
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

export const routineSetSchema = z.strictObject(routineSetFields);
export const routineExerciseFields = {
	exercise_template_id: nonEmptyId,
	superset_id: z.coerce.number().nullable().optional(),
	rest_seconds: z.coerce.number().int().min(0).optional(),
	notes: z.string().optional(),
	sets: z.array(routineSetSchema),
} as const satisfies {
	[
		K in keyof NonNullable<
			NonNullable<PostRoutinesRequestBody["routine"]>["exercises"]
		>[number]
	]: z.ZodTypeAny;
};

export const routineExerciseSchema = z.strictObject({
	...routineExerciseFields,
	sets: z
		.array(routineSetSchema)
		.min(1, "Each routine exercise must contain at least one set"),
});

export const routineExercisesSchema = z
	.array(routineExerciseSchema)
	.min(1, "A routine must contain at least one exercise")
	.nonoptional();

export const routinePayloadFields = {
	title: z.string().min(1),
	folder_id: z.coerce.number().nullable().optional(),
	notes: z.string().optional(),
	exercises: routineExercisesSchema,
} as const satisfies {
	[K in keyof NonNullable<PostRoutinesRequestBody["routine"]>]: z.ZodTypeAny;
};

export const routinePayloadSchema = z.strictObject(routinePayloadFields);
export const createRoutineInputSchema = z.strictObject({
	routine: routinePayloadSchema,
});
export const createRoutineInputFields = createRoutineInputSchema.shape;

export const routineUpdatePayloadFields = {
	title: z.string().min(1),
	notes: z.string().optional(),
	exercises: routineExercisesSchema,
} as const satisfies {
	[K in keyof NonNullable<PutRoutinesRequestBody["routine"]>]: z.ZodTypeAny;
};

export const routineUpdatePayloadSchema = z.strictObject(
	routineUpdatePayloadFields,
);
export const updateRoutineInputSchema = z.strictObject({
	routine_id: nonEmptyId,
	routine: routineUpdatePayloadSchema,
});
export const updateRoutineInputFields = updateRoutineInputSchema.shape;

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
	abdomen: zNullableNumber,
	waist: zNullableNumber,
	hips: zNullableNumber,
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
export const createBodyMeasurementInputFields =
	createBodyMeasurementInputSchema.shape;
export const updateBodyMeasurementInputFields =
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
