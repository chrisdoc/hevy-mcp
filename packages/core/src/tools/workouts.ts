import { z } from "zod";
import { Effect } from "effect";
import {
	paginationFields,
	nonEmptyId,
	replaceWorkoutExercisesInputFields,
	updateWorkoutInputFields,
	workoutInputFields,
} from "./input-schemas.js";
import type { ToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";
import { HevyOperationsService } from "../effect-services.js";
import {
	createWorkoutResponse,
	updateWorkoutResponse,
	workoutEventsResponse,
	workoutResponse,
	workoutsResponse,
} from "../utils/response-contracts.js";
import {
	createAnnotations,
	readOnlyAnnotations,
	updateAnnotations,
} from "../utils/tool-annotations.js";
import { WORKOUT_PUT_REQUIRES_IS_PRIVATE } from "@hevy-mcp/operations";

import type { InferToolParams } from "../utils/tool-helpers.js";
import { operationEffect, requireOperation } from "./operation-helpers.js";

const getWorkoutsSchema = paginationFields({
	defaultPageSize: 5,
	maxPageSize: 10,
	integerPage: false,
});
type GetWorkoutsParams = InferToolParams<typeof getWorkoutsSchema>;

const getWorkoutSchema = { workout_id: nonEmptyId } as const;
type GetWorkoutParams = InferToolParams<typeof getWorkoutSchema>;

const getWorkoutEventsSchema = {
	...paginationFields({ defaultPageSize: 5, maxPageSize: 10 }),
	since: z.string().default("1970-01-01T00:00:00Z"),
} as const;
type GetWorkoutEventsParams = InferToolParams<typeof getWorkoutEventsSchema>;

const createWorkoutSchema = workoutInputFields;
type CreateWorkoutParams = InferToolParams<typeof createWorkoutSchema>;

const updateWorkoutSchema = updateWorkoutInputFields;
type UpdateWorkoutParams = InferToolParams<typeof updateWorkoutSchema>;

const replaceWorkoutExercisesSchema = replaceWorkoutExercisesInputFields;
type ReplaceWorkoutExercisesParams = InferToolParams<
	typeof replaceWorkoutExercisesSchema
>;

export const workoutToolDefinitions = [
	{
		name: "get-workouts",
		feature: "workouts" as const,
		operation: "list" as const,
		description:
			"Read-only. Lists compact workout summaries in Hevy API pagination order, not sorted by workout start_time. Use get-workout for exercises and sets; results are paginated.",
		inputSchema: getWorkoutsSchema,
		outputSchema: workoutsResponse.outputSchema,
		annotations: readOnlyAnnotations("Get Workouts"),
		kind: "read" as const,
		responseContract: workoutsResponse,
		execute: (runtime: ToolRuntime, args: GetWorkoutsParams) =>
			operationEffect(
				requireOperation(
					runtime.service(HevyOperationsService).workouts.list,
					"workouts.list",
				),
				{
					page: args.page,
					pageSize: args.page_size,
				},
				runtime.execution,
			),
	},
	{
		name: "get-workout",
		feature: "workouts" as const,
		operation: "get" as const,
		description:
			"Read-only. Gets one workout with exercises and sets by workout_id. Use get-workouts to discover IDs.",
		inputSchema: getWorkoutSchema,
		outputSchema: workoutResponse.outputSchema,
		annotations: readOnlyAnnotations("Get Workout"),
		kind: "read" as const,
		responseContract: workoutResponse,
		execute: (runtime: ToolRuntime, args: GetWorkoutParams) =>
			operationEffect(
				requireOperation(
					runtime.service(HevyOperationsService).workouts.get,
					"workouts.get",
				),
				{ workoutId: args.workout_id },
				runtime.execution,
			).pipe(
				Effect.map((data) => ({
					...data,
					workout_id: args.workout_id,
				})),
			),
	},
	{
		name: "get-workout-events",
		feature: "workouts" as const,
		operation: "sync" as const,
		description:
			"Read-only. Lists workout update and deletion events since a timestamp for incremental sync; results are paginated.",
		inputSchema: getWorkoutEventsSchema,
		outputSchema: workoutEventsResponse.outputSchema,
		annotations: readOnlyAnnotations("Get Workout Events"),
		kind: "read" as const,
		responseContract: workoutEventsResponse,
		execute: (runtime: ToolRuntime, args: GetWorkoutEventsParams) =>
			operationEffect(
				requireOperation(
					runtime.service(HevyOperationsService).workouts.events,
					"workouts.events",
				),
				{
					page: args.page,
					pageSize: args.page_size,
					since: args.since,
				},
				runtime.execution,
			),
	},
	{
		name: "create-workout",
		feature: "workouts" as const,
		operation: "create" as const,
		description:
			"Writes a completed workout. Requires exercise-template IDs and UTC times. Retries can create duplicates.",
		inputSchema: createWorkoutSchema,
		annotations: createAnnotations("Create Workout"),
		kind: "write" as const,
		responseContract: createWorkoutResponse,
		execute: (runtime: ToolRuntime, args: CreateWorkoutParams) =>
			operationEffect(
				requireOperation(
					runtime.service(HevyOperationsService).workouts.create,
					"workouts.create",
				),
				{ workout: args.workout },
				runtime.execution,
			),
	},
	{
		name: "update-workout",
		feature: "workouts" as const,
		operation: "update" as const,
		description:
			"Mutates workout metadata by ID. " +
			WORKOUT_PUT_REQUIRES_IS_PRIVATE.updateClause +
			"; omitted fields and all exercises otherwise remain unchanged.",
		inputSchema: updateWorkoutSchema,
		annotations: updateAnnotations("Update Workout"),
		kind: "write" as const,
		responseContract: updateWorkoutResponse,
		execute: (runtime: ToolRuntime, args: UpdateWorkoutParams) =>
			operationEffect(
				requireOperation(
					runtime.service(HevyOperationsService).workouts.update,
					"workouts.update",
				),
				{
					workoutId: args.workout_id,
					workout: args.workout,
				},
				runtime.execution,
			).pipe(
				Effect.map((workout) => ({
					workout,
					workout_id: args.workout_id,
				})),
			),
	},
	{
		name: "replace-workout-exercises",
		feature: "workouts" as const,
		operation: "update" as const,
		description:
			"Mutates a workout by replacing all exercises and sets. " +
			WORKOUT_PUT_REQUIRES_IS_PRIVATE.replaceExercisesClause +
			"; other workout metadata remains unchanged.",
		inputSchema: replaceWorkoutExercisesSchema,
		annotations: updateAnnotations("Replace Workout Exercises"),
		kind: "write" as const,
		responseContract: updateWorkoutResponse,
		execute: (runtime: ToolRuntime, args: ReplaceWorkoutExercisesParams) =>
			operationEffect(
				requireOperation(
					runtime.service(HevyOperationsService).workouts.replaceExercises,
					"workouts.replaceExercises",
				),
				{
					workoutId: args.workout_id,
					exercises: args.workout.exercises,
					is_private: args.workout.is_private,
				},
				runtime.execution,
			).pipe(
				Effect.map((workout) => ({
					workout,
					workout_id: args.workout_id,
				})),
			),
	},
] satisfies readonly ToolDefinition<Record<string, z.ZodTypeAny>, unknown>[];
