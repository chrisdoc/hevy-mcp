import { z } from "zod";
import type {
	GetV1WorkoutsEvents200,
	PostV1Workouts201,
	PutV1WorkoutsWorkoutid200,
} from "@hevy-mcp/hevy-client/types";
import {
	paginationShape,
	nonEmptyId,
	replaceWorkoutExercisesInputShape,
	updateWorkoutInputShape,
	workoutInputShape,
} from "./input-schemas.js";
import type { ToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";
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

import type { InferToolParams } from "../utils/tool-helpers.js";
import { buildWorkoutUpdatePayload } from "./mutation-semantics.js";
import { isExpectedListPageNotFound } from "../utils/hevy-error-policy.js";

const getWorkoutsSchema = paginationShape({
	defaultPageSize: 5,
	maxPageSize: 10,
	integerPage: false,
});
type GetWorkoutsParams = InferToolParams<typeof getWorkoutsSchema>;

const getWorkoutSchema = { workout_id: nonEmptyId } as const;
type GetWorkoutParams = InferToolParams<typeof getWorkoutSchema>;

const getWorkoutEventsSchema = {
	...paginationShape({ defaultPageSize: 5, maxPageSize: 10 }),
	since: z.string().default("1970-01-01T00:00:00Z"),
} as const;
type GetWorkoutEventsParams = InferToolParams<typeof getWorkoutEventsSchema>;

const createWorkoutSchema = workoutInputShape;
type CreateWorkoutParams = InferToolParams<typeof createWorkoutSchema>;

const updateWorkoutSchema = updateWorkoutInputShape;
type UpdateWorkoutParams = InferToolParams<typeof updateWorkoutSchema>;

const replaceWorkoutExercisesSchema = replaceWorkoutExercisesInputShape;
type ReplaceWorkoutExercisesParams = InferToolParams<
	typeof replaceWorkoutExercisesSchema
>;

export const workoutToolDefinitions = [
	{
		name: "get-workouts",
		feature: "workouts" as const,
		operation: "list" as const,
		description:
			"Read-only. Lists compact workout summaries newest first. Use get-workout for exercises and sets; results are paginated.",
		inputSchema: getWorkoutsSchema,
		outputSchema: workoutsResponse.outputSchema,
		annotations: readOnlyAnnotations("Get Workouts"),
		kind: "read" as const,
		responseContract: workoutsResponse,
		execute: async (runtime: ToolRuntime, args: GetWorkoutsParams) => {
			const data = await runtime.getOperations().workouts.list.execute(
				{
					page: args.page,
					pageSize: args.page_size,
				},
				runtime.execution,
			);
			return data;
		},
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
		execute: async (runtime: ToolRuntime, args: GetWorkoutParams) => {
			const data = await runtime
				.getOperations()
				.workouts.get.execute(
					{ workoutId: args.workout_id },
					runtime.execution,
				);
			return { ...data, workout_id: args.workout_id };
		},
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
		execute: async (runtime: ToolRuntime, args: GetWorkoutEventsParams) => {
			try {
				const data: GetV1WorkoutsEvents200 = await runtime
					.getClient()
					.getWorkoutEvents({
						page: args.page,
						pageSize: args.page_size,
						since: args.since,
					});
				return {
					events: data?.events,
					since: args.since,
					page: args.page,
					pageCount: data?.page_count,
				};
			} catch (error) {
				if (isExpectedListPageNotFound(error, args.page)) {
					return {
						events: [],
						since: args.since,
						page: args.page,
						expected404Outcome: "end_of_list",
					};
				}
				throw error;
			}
		},
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
		execute: async (runtime: ToolRuntime, args: CreateWorkoutParams) => {
			const data: PostV1Workouts201 = await runtime.getClient().createWorkout({
				workout: args.workout,
			});
			return data;
		},
	},
	{
		name: "update-workout",
		feature: "workouts" as const,
		operation: "update" as const,
		description:
			"Mutates workout metadata by ID. Omitted fields and all exercises remain unchanged.",
		inputSchema: updateWorkoutSchema,
		annotations: updateAnnotations("Update Workout"),
		kind: "write" as const,
		responseContract: updateWorkoutResponse,
		execute: async (runtime: ToolRuntime, args: UpdateWorkoutParams) => {
			const client = runtime.getClient();
			const current = await client.getWorkout(args.workout_id);
			const payload = buildWorkoutUpdatePayload(current, args.workout);
			const data: PutV1WorkoutsWorkoutid200 = await client.updateWorkout(
				args.workout_id,
				{ workout: payload },
			);
			return { workout: data, workout_id: args.workout_id };
		},
	},
	{
		name: "replace-workout-exercises",
		feature: "workouts" as const,
		operation: "update" as const,
		description:
			"Mutates a workout by replacing all exercises and sets. Workout metadata remains unchanged.",
		inputSchema: replaceWorkoutExercisesSchema,
		annotations: updateAnnotations("Replace Workout Exercises"),
		kind: "write" as const,
		responseContract: updateWorkoutResponse,
		execute: async (
			runtime: ToolRuntime,
			args: ReplaceWorkoutExercisesParams,
		) => {
			const client = runtime.getClient();
			const current = await client.getWorkout(args.workout_id);
			const payload = buildWorkoutUpdatePayload(
				current,
				{},
				args.workout.exercises,
			);
			const data: PutV1WorkoutsWorkoutid200 = await client.updateWorkout(
				args.workout_id,
				{ workout: payload },
			);
			return { workout: data, workout_id: args.workout_id };
		},
	},
] satisfies readonly ToolDefinition<Record<string, z.ZodTypeAny>, unknown>[];
