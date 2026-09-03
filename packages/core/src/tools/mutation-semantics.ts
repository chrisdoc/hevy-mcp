/**
 * Compatibility re-export for existing core consumers.
 *
 * Mutation payload policy belongs to @hevy-mcp/operations so MCP tools and
 * other adapters use the same implementation.
 */
export {
	buildMeasurementPayload,
	buildRoutinePayload,
	buildWorkoutUpdatePayload,
	mergeMeasurementPayload,
} from "@hevy-mcp/operations";
export type {
	MeasurementFields,
	MeasurementMergeResult,
	MeasurementPayload,
	RoutineCreatePayload,
	RoutineExerciseInput,
	RoutinePayloadInput,
	RoutinePayloadResult,
	RoutineRepRangeInput,
	RoutineSetInput,
	RoutineUpdatePayload,
	WorkoutExerciseInput,
	WorkoutMetadataPatchInput,
	WorkoutSetInput,
	WorkoutUpdatePayload,
} from "@hevy-mcp/operations";
