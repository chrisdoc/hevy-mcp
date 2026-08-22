/**
 * Snake_case zod schemas describing MCP tool output shapes, plus the types
 * inferred from them. Schemas only: projection logic lives in formatters.ts,
 * contract wiring lives in response-contracts.ts.
 */
import { z } from "zod";

export const optionalNumber = z.number().optional();

export const formattedWorkoutSetSchema = z.object({
	index: z.number().optional(),
	type: z.string().optional(),
	weight_kg: optionalNumber,
	reps: optionalNumber,
	distance_meters: optionalNumber,
	duration_seconds: optionalNumber,
	rpe: optionalNumber,
	custom_metric: optionalNumber,
});

export const formattedWorkoutExerciseSchema = z.object({
	index: z.number().optional(),
	title: z.string().optional(),
	exercise_template_id: z.string().optional(),
	notes: z.string().optional(),
	supersets_id: optionalNumber,
	sets: z.array(formattedWorkoutSetSchema).optional(),
});

export const formattedWorkoutSchema = z.object({
	id: z.string().optional(),
	routine_id: z.string().optional(),
	title: z.string().optional(),
	description: z.string().optional(),
	start_time: z.string().optional(),
	end_time: z.string().optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
	duration: z.string(),
	exercises: z.array(formattedWorkoutExerciseSchema).optional(),
});

export const formattedRoutineSetSchema = z.object({
	index: z.number().optional(),
	type: z.string().optional(),
	weight_kg: optionalNumber,
	reps: optionalNumber,
	distance_meters: optionalNumber,
	duration_seconds: optionalNumber,
	custom_metric: optionalNumber,
	rep_range: z
		.object({
			start: z.number().optional(),
			end: z.number().optional(),
		})
		.optional(),
	rpe: optionalNumber,
});

export const formattedRoutineExerciseSchema = z.object({
	title: z.string().optional(),
	index: z.number().optional(),
	exercise_template_id: z.string().optional(),
	notes: z.string().optional(),
	supersets_id: optionalNumber,
	rest_seconds: z.number().int().optional(),
	sets: z.array(formattedRoutineSetSchema).optional(),
});

export const formattedRoutineSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	folder_id: z.number().optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
	exercises: z.array(formattedRoutineExerciseSchema).optional(),
});

export const createRoutineOutputSchema = {
	created: z.literal(true),
	commit_state: z.literal("confirmed"),
	routine: formattedRoutineSchema.nullable(),
	routine_id: z.string().nullable(),
	uses_rep_ranges: z.boolean(),
} as const;

export const formattedRoutineFolderSchema = z.object({
	id: z.number().optional(),
	title: z.string().optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
});

export const formattedExerciseTemplateSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	type: z.string().optional(),
	primary_muscle_group: z.string().optional(),
	secondary_muscle_groups: z.array(z.string()).optional(),
	is_custom: z.boolean().optional(),
});

export const formattedExerciseHistoryEntrySchema = z.object({
	workout_id: z.string().optional(),
	workout_title: z.string().optional(),
	workout_start_time: z.string().optional(),
	workout_end_time: z.string().optional(),
	exercise_template_id: z.string().optional(),
	weight_kg: optionalNumber,
	reps: optionalNumber,
	distance_meters: optionalNumber,
	duration_seconds: optionalNumber,
	rpe: optionalNumber,
	custom_metric: optionalNumber,
	set_type: z.string().optional(),
});

export const formattedBodyMeasurementSchema = z.object({
	date: z.string(),
	weight_kg: optionalNumber,
	lean_mass_kg: optionalNumber,
	fat_percent: optionalNumber,
	neck_cm: optionalNumber,
	shoulder_cm: optionalNumber,
	chest_cm: optionalNumber,
	left_bicep_cm: optionalNumber,
	right_bicep_cm: optionalNumber,
	left_forearm_cm: optionalNumber,
	right_forearm_cm: optionalNumber,
	abdomen: optionalNumber,
	waist: optionalNumber,
	hips: optionalNumber,
	left_thigh_cm: optionalNumber,
	right_thigh_cm: optionalNumber,
	left_calf_cm: optionalNumber,
	right_calf_cm: optionalNumber,
});
export const scanSchema = z.object({
	pages: z.record(z.string(), z.number().int().nonnegative()),
	items: z.number().int().nonnegative(),
});

export const trainingSummarySessionSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	start_time: z.string().optional(),
	end_time: z.string().optional(),
	duration_seconds: z.number().int().nonnegative().optional(),
	exercise_count: z.number().int().nonnegative(),
	set_count: z.number().int().nonnegative(),
});

export const compactRoutineSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	folder_id: z.number().optional(),
	updated_at: z.string().optional(),
	exercise_count: z.number().int().nonnegative(),
	set_count: z.number().int().nonnegative(),
});

export type CompactRoutine = z.infer<typeof compactRoutineSchema>;

export type FormattedWorkoutSet = z.infer<typeof formattedWorkoutSetSchema>;
export type FormattedWorkoutExercise = z.infer<
	typeof formattedWorkoutExerciseSchema
>;
export type FormattedWorkout = z.infer<typeof formattedWorkoutSchema>;
export type FormattedRoutineSet = z.infer<typeof formattedRoutineSetSchema>;
export type FormattedRoutineExercise = z.infer<
	typeof formattedRoutineExerciseSchema
>;
export type FormattedRoutine = z.infer<typeof formattedRoutineSchema>;
export type FormattedRoutineFolder = z.infer<
	typeof formattedRoutineFolderSchema
>;
export type FormattedExerciseTemplate = z.infer<
	typeof formattedExerciseTemplateSchema
>;
export type FormattedExerciseHistoryEntry = z.infer<
	typeof formattedExerciseHistoryEntrySchema
>;
export type FormattedBodyMeasurement = z.infer<
	typeof formattedBodyMeasurementSchema
>;

export const formattedWorkoutSummarySchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	start_time: z.string().optional(),
	end_time: z.string().optional(),
	duration: z.string(),
	exercise_count: z.number().int().nonnegative(),
	set_count: z.number().int().nonnegative(),
});
export type FormattedWorkoutSummary = z.infer<
	typeof formattedWorkoutSummarySchema
>;
export const formattedUpdatedWorkoutSchema = z.object({
	type: z.literal("updated"),
	workout: formattedWorkoutSchema,
});
export const formattedDeletedWorkoutSchema = z.object({
	type: z.literal("deleted"),
	id: z.string(),
	deleted_at: z.string().optional(),
});
