import { z } from "zod";
import type {
	GetV1Workouts200,
	GetV1WorkoutsCount200,
	GetV1WorkoutsEvents200,
	GetV1WorkoutsWorkoutid200,
	PostV1Workouts201,
	PutV1WorkoutsWorkoutid200,
} from "@hevy-mcp/hevy-client/types";
import { buildWorkoutPayload } from "./payload-mappers.js";
import {
	paginationShape,
	nonEmptyId,
	workoutPayloadShape,
} from "./input-schemas.js";
import type { ToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";
import {
	createWorkoutResponse,
	updateWorkoutResponse,
	workoutCountResponse,
	workoutEventsResponse,
	workoutResponse,
	workoutsResponse,
} from "../utils/response-formatter.js";
import {
	createAnnotations,
	readOnlyAnnotations,
	updateAnnotations,
} from "../utils/tool-annotations.js";
import { describeTool } from "../utils/tool-descriptions.js";
import type { InferToolParams } from "../utils/tool-helpers.js";
import {
	isExpectedListPageNotFound,
	isExpectedReadNotFound,
} from "../utils/hevy-error-policy.js";

const getWorkoutsSchema = paginationShape({
	defaultPageSize: 5,
	maxPageSize: 10,
	integerPage: false,
});
type GetWorkoutsParams = InferToolParams<typeof getWorkoutsSchema>;

const getWorkoutSchema = { workoutId: nonEmptyId } as const;
type GetWorkoutParams = InferToolParams<typeof getWorkoutSchema>;

const getWorkoutEventsSchema = {
	...paginationShape({ defaultPageSize: 5, maxPageSize: 10 }),
	since: z.string().default("1970-01-01T00:00:00Z"),
} as const;
type GetWorkoutEventsParams = InferToolParams<typeof getWorkoutEventsSchema>;

const createWorkoutSchema = workoutPayloadShape;
type CreateWorkoutParams = InferToolParams<typeof createWorkoutSchema>;

const updateWorkoutSchema = {
	workoutId: nonEmptyId,
	...workoutPayloadShape,
} as const;
type UpdateWorkoutParams = InferToolParams<typeof updateWorkoutSchema>;

export const workoutToolDefinitions = [
	{
		name: "get-workouts",
		feature: "workouts" as const,
		operation: "list" as const,
		description: describeTool({
			summary:
				"Read-only. Lists workouts from newest to oldest with exercise and timing details.",
			aliases: ["list workout history", "show recent workouts", "browse logs"],
			useCase:
				"Use to browse or page through workout history; use get-workout when a workout ID is already known.",
			importantNotes:
				"Results are paginated; page starts at 1 and pageSize is limited to 10.",
		}),
		inputSchema: getWorkoutsSchema,
		outputSchema: workoutsResponse.outputSchema,
		annotations: readOnlyAnnotations("Get Workouts"),
		kind: "read" as const,
		responseContract: workoutsResponse,
		execute: async (runtime: ToolRuntime, args: GetWorkoutsParams) => {
			try {
				const data: GetV1Workouts200 = await runtime.getClient().getWorkouts({
					page: args.page,
					pageSize: args.pageSize,
				});
				return {
					items: data?.workouts ?? [],
					page: args.page,
					pageCount: data?.page_count,
				};
			} catch (error) {
				if (isExpectedListPageNotFound(error, args.page)) {
					return {
						items: [],
						page: args.page,
						expected404Outcome: "end_of_list",
					};
				}
				throw error;
			}
		},
	},
	{
		name: "get-workout",
		feature: "workouts" as const,
		operation: "get" as const,
		description: describeTool({
			summary:
				"Read-only. Retrieves complete details for one workout by its ID.",
			aliases: ["show workout", "fetch workout details", "open workout log"],
			useCase:
				"Use after get-workouts identifies the exact workout; do not use for browsing multiple workouts.",
			importantNotes:
				"Requires a workoutId discovered from a workout list, event, or prior create response.",
		}),
		inputSchema: getWorkoutSchema,
		outputSchema: workoutResponse.outputSchema,
		annotations: readOnlyAnnotations("Get Workout"),
		kind: "read" as const,
		responseContract: workoutResponse,
		execute: async (runtime: ToolRuntime, args: GetWorkoutParams) => {
			try {
				const data: GetV1WorkoutsWorkoutid200 = await runtime
					.getClient()
					.getWorkout(args.workoutId);
				return { workout: data, workoutId: args.workoutId };
			} catch (error) {
				if (isExpectedReadNotFound(error)) {
					return {
						workout: null,
						workoutId: args.workoutId,
						expected404Outcome: "not_found",
					};
				}
				throw error;
			}
		},
	},
	{
		name: "get-workout-count",
		feature: "workouts" as const,
		operation: "count" as const,
		description: describeTool({
			summary: "Read-only. Returns the total workout count for the account.",
			aliases: ["count workouts", "how many workouts", "workout total"],
			useCase:
				"Use for totals, statistics, or estimating pages; use get-workouts for actual workout records.",
			importantNotes:
				"Returns only a count and accepts no paging or date filters.",
		}),
		inputSchema: {},
		outputSchema: workoutCountResponse.outputSchema,
		annotations: readOnlyAnnotations("Get Workout Count"),
		kind: "read" as const,
		responseContract: workoutCountResponse,
		execute: async (runtime: ToolRuntime) => {
			const data: GetV1WorkoutsCount200 = await runtime
				.getClient()
				.getWorkoutCount();
			return data?.workout_count ?? 0;
		},
	},
	{
		name: "get-workout-events",
		feature: "workouts" as const,
		operation: "sync" as const,
		description: describeTool({
			summary:
				"Read-only. Lists workout update and delete events since a timestamp, newest first.",
			aliases: [
				"sync workout changes",
				"workout change feed",
				"deleted workouts",
			],
			useCase:
				"Use to incrementally synchronize a local workout cache; use get-workouts for the current workout list.",
			importantNotes:
				"since must be a timestamp string; events are paginated with pageSize at most 10, and the default since value reads from 1970.",
		}),
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
						pageSize: args.pageSize,
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
		description: describeTool({
			summary: "Writes to the Hevy account by creating a new workout.",
			aliases: ["log workout", "add workout", "record training session"],
			useCase:
				"Use to add a completed workout; use update-workout only when modifying an existing workout ID.",
			importantNotes:
				"Requires UTC startTime/endTime in YYYY-MM-DDTHH:mm:ssZ form and exercise template IDs. Retrying can create duplicates.",
		}),
		inputSchema: createWorkoutSchema,
		annotations: createAnnotations("Create Workout"),
		kind: "write" as const,
		responseContract: createWorkoutResponse,
		execute: async (runtime: ToolRuntime, args: CreateWorkoutParams) => {
			const data: PostV1Workouts201 = await runtime.getClient().createWorkout({
				workout: buildWorkoutPayload(args),
			});
			return data;
		},
	},
	{
		name: "update-workout",
		feature: "workouts" as const,
		operation: "update" as const,
		description: describeTool({
			summary: "Mutates the Hevy account by replacing an existing workout.",
			aliases: [
				"edit workout",
				"correct workout log",
				"replace workout details",
			],
			useCase:
				"Use to revise a known workout; use create-workout for a new training session.",
			importantNotes:
				"Requires workoutId plus the complete title, times, privacy, exercises, and sets payload; omitted optional values may be cleared or defaulted.",
		}),
		inputSchema: updateWorkoutSchema,
		annotations: updateAnnotations("Update Workout"),
		kind: "write" as const,
		responseContract: updateWorkoutResponse,
		execute: async (runtime: ToolRuntime, args: UpdateWorkoutParams) => {
			const data: PutV1WorkoutsWorkoutid200 = await runtime
				.getClient()
				.updateWorkout(args.workoutId, {
					workout: buildWorkoutPayload(args),
				});
			return { workout: data, workoutId: args.workoutId };
		},
	},
] satisfies readonly ToolDefinition<Record<string, z.ZodTypeAny>, unknown>[];
