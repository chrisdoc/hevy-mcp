import { bodyMeasurementSchema } from "@hevy-mcp/hevy-client/schemas";
import { z } from "zod";
import {
	bodyMeasurementFieldsSchema,
	exerciseTemplateInputShape,
	routineFolderInputShape,
	routinePayloadShape,
	routineExerciseShape,
	routineSetShape,
	workoutExerciseShape,
	workoutPayloadShape,
	workoutSetShape,
} from "./tools/input-schemas.js";
import {
	buildExerciseTemplateRequest,
	buildMeasurementPayload,
	buildRoutineFolderRequest,
	buildRoutinePayload,
	buildWorkoutPayload,
	mergeMeasurementPayload,
} from "./tools/payload-mappers.js";
import { parseJsonArray } from "./utils/json-parser.js";
import { zStrictOptionalRepRange } from "./utils/schemas.js";

const strictWorkoutSetSchema = z.object(workoutSetShape).strict();
const strictWorkoutExerciseSchema = z
	.object({
		...workoutExerciseShape,
		sets: z.array(strictWorkoutSetSchema),
	})
	.strict();
const strictWorkoutExercisesSchema = z.preprocess(
	parseJsonArray,
	z.array(strictWorkoutExerciseSchema),
);

export const workoutInputSchema = z
	.object({
		...workoutPayloadShape,
		exercises: strictWorkoutExercisesSchema,
	})
	.strict();

const strictRoutineSetSchema = z
	.object({
		...routineSetShape,
		repRange: zStrictOptionalRepRange,
	})
	.strict();
const strictRoutineExerciseSchema = z
	.object({
		...routineExerciseShape,
		sets: z.array(strictRoutineSetSchema),
	})
	.strict();
const strictRoutineExercisesSchema = z.preprocess(
	parseJsonArray,
	z.array(strictRoutineExerciseSchema),
);

export const createRoutineInputSchema = z
	.object({
		...routinePayloadShape,
		exercises: strictRoutineExercisesSchema,
	})
	.strict();

export const updateRoutineInputSchema = z
	.object({
		title: routinePayloadShape.title,
		notes: routinePayloadShape.notes,
		exercises: strictRoutineExercisesSchema,
	})
	.strict();

export const exerciseTemplateInputSchema = z
	.object(exerciseTemplateInputShape)
	.strict();

export const routineFolderInputSchema = z
	.object(routineFolderInputShape)
	.strict();

export const bodyMeasurementFieldsInputSchema = z
	.object(bodyMeasurementFieldsSchema)
	.strict();

export const existingBodyMeasurementSchema = bodyMeasurementSchema.strict();

export {
	buildExerciseTemplateRequest,
	buildMeasurementPayload,
	buildRoutineFolderRequest,
	buildRoutinePayload,
	buildWorkoutPayload,
	mergeMeasurementPayload,
};
export type {
	ExerciseTemplateInput,
	MeasurementFields,
	RoutineFolderInput,
	RoutinePayloadInput,
	WorkoutPayloadInput,
} from "./tools/input-schemas.js";
