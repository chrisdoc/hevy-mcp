import { bodyMeasurementSchema } from "@hevy-mcp/hevy-client/schemas";
import { z } from "zod";
import {
	bodyMeasurementFieldsSchema,
	createBodyMeasurementInputSchema,
	createRoutineInputSchema,
	exerciseTemplateInputSchema,
	routineFolderInputSchema,
	updateBodyMeasurementInputSchema,
	updateRoutineInputSchema,
	updateWorkoutInputSchema,
	workoutInputSchema,
} from "./tools/input-schemas.js";
import {
	buildMeasurementPayload,
	buildRoutinePayload,
	mergeMeasurementPayload,
} from "./tools/mutation-semantics.js";

export {
	createBodyMeasurementInputSchema,
	createRoutineInputSchema,
	exerciseTemplateInputSchema,
	routineFolderInputSchema,
	updateBodyMeasurementInputSchema,
	updateRoutineInputSchema,
	workoutInputSchema,
	updateWorkoutInputSchema,
};

export const bodyMeasurementFieldsInputSchema = z
	.strictObject(bodyMeasurementFieldsSchema)
	.describe("Measurement fields");
export const existingBodyMeasurementSchema = bodyMeasurementSchema.strict();

export {
	buildMeasurementPayload,
	buildRoutinePayload,
	mergeMeasurementPayload,
};
export type {
	ExerciseTemplateInput,
	MeasurementFields,
	RoutineFolderInput,
	RoutinePayloadInput,
	WorkoutPayloadInput,
} from "./tools/input-schemas.js";
