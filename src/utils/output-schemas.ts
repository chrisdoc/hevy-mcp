import { z } from "zod";
import { deletedWorkoutSchema } from "../generated/client/schemas/deletedWorkoutSchema.js";
import { updatedWorkoutSchema } from "../generated/client/schemas/updatedWorkoutSchema.js";
import { userInfoSchema } from "../generated/client/schemas/userInfoSchema.js";

const optionalNullableNumber = z.number().nullable().optional();

export const formattedWorkoutSetSchema = z.object({
	index: z.number().optional(),
	type: z.string().optional(),
	weight: optionalNullableNumber,
	reps: optionalNullableNumber,
	distance: optionalNullableNumber,
	duration: optionalNullableNumber,
	rpe: optionalNullableNumber,
	customMetric: optionalNullableNumber,
});

export const formattedWorkoutExerciseSchema = z.object({
	index: z.number().optional(),
	name: z.string().optional(),
	exerciseTemplateId: z.string().optional(),
	notes: z.string().nullable().optional(),
	supersetsId: optionalNullableNumber,
	sets: z.array(formattedWorkoutSetSchema).optional(),
});

export const formattedWorkoutSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	description: z.string().nullable().optional(),
	startTime: z.string().optional(),
	endTime: z.string().optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
	duration: z.string(),
	exercises: z.array(formattedWorkoutExerciseSchema).optional(),
});

export const formattedRoutineSetSchema = z.object({
	index: z.number().optional(),
	type: z.string().optional(),
	weight: optionalNullableNumber,
	reps: optionalNullableNumber,
	distance: optionalNullableNumber,
	duration: optionalNullableNumber,
	customMetric: optionalNullableNumber,
	repRange: z
		.object({
			start: z.number().nullable().optional(),
			end: z.number().nullable().optional(),
		})
		.nullable()
		.optional(),
	rpe: optionalNullableNumber,
});

export const formattedRoutineExerciseSchema = z.object({
	name: z.string().optional(),
	index: z.number().optional(),
	exerciseTemplateId: z.string().optional(),
	notes: z.string().nullable().optional(),
	supersetId: optionalNullableNumber,
	restSeconds: z.union([z.string(), z.number()]).nullable().optional(),
	sets: z.array(formattedRoutineSetSchema).optional(),
});

export const formattedRoutineSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	folderId: z.number().nullable().optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
	exercises: z.array(formattedRoutineExerciseSchema).optional(),
});

export const formattedRoutineFolderSchema = z.object({
	id: z.number().optional(),
	title: z.string().optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});

export const formattedExerciseTemplateSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	type: z.string().optional(),
	primaryMuscleGroup: z.string().optional(),
	secondaryMuscleGroups: z.array(z.string()).optional(),
	isCustom: z.boolean().optional(),
});

export const formattedExerciseHistoryEntrySchema = z.object({
	workoutId: z.string().optional(),
	workoutTitle: z.string().optional(),
	workoutStartTime: z.string().optional(),
	workoutEndTime: z.string().optional(),
	exerciseTemplateId: z.string().optional(),
	weight: optionalNullableNumber,
	reps: optionalNullableNumber,
	distance: optionalNullableNumber,
	duration: optionalNullableNumber,
	rpe: optionalNullableNumber,
	customMetric: optionalNullableNumber,
	setType: z.string().optional(),
});

export const formattedBodyMeasurementSchema = z.object({
	date: z.string(),
	weightKg: z.number().nullable(),
	leanMassKg: z.number().nullable(),
	fatPercent: z.number().nullable(),
	neckCm: z.number().nullable(),
	shoulderCm: z.number().nullable(),
	chestCm: z.number().nullable(),
	leftBicepCm: z.number().nullable(),
	rightBicepCm: z.number().nullable(),
	leftForearmCm: z.number().nullable(),
	rightForearmCm: z.number().nullable(),
	abdomen: z.number().nullable(),
	waist: z.number().nullable(),
	hips: z.number().nullable(),
	leftThigh: z.number().nullable(),
	rightThigh: z.number().nullable(),
	leftCalf: z.number().nullable(),
	rightCalf: z.number().nullable(),
});

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

export const workoutsOutputSchema = {
	workouts: z.array(formattedWorkoutSchema),
} as const;
export const workoutOutputSchema = {
	workout: formattedWorkoutSchema.nullable(),
} as const;
export const workoutCountOutputSchema = { count: z.number().int() } as const;
export const workoutEventsOutputSchema = {
	events: z.array(z.union([updatedWorkoutSchema, deletedWorkoutSchema])),
} as const;
export const routinesOutputSchema = {
	routines: z.array(formattedRoutineSchema),
} as const;
export const routineOutputSchema = {
	routine: formattedRoutineSchema.nullable(),
} as const;
export const exerciseTemplatesOutputSchema = {
	exerciseTemplates: z.array(formattedExerciseTemplateSchema),
} as const;
export const exerciseTemplateOutputSchema = {
	exerciseTemplate: formattedExerciseTemplateSchema.nullable(),
} as const;
export const exerciseHistoryOutputSchema = {
	exerciseHistory: z.array(formattedExerciseHistoryEntrySchema),
} as const;
export const routineFoldersOutputSchema = {
	routineFolders: z.array(formattedRoutineFolderSchema),
} as const;
export const routineFolderOutputSchema = {
	routineFolder: formattedRoutineFolderSchema.nullable(),
} as const;
export const bodyMeasurementsOutputSchema = {
	bodyMeasurements: z.array(formattedBodyMeasurementSchema),
} as const;
export const bodyMeasurementOutputSchema = {
	bodyMeasurement: formattedBodyMeasurementSchema.nullable(),
} as const;
export const userOutputSchema = { user: userInfoSchema.nullable() } as const;
