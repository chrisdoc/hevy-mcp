import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
	GetV1Workouts200,
	GetV1WorkoutsCount200,
	GetV1WorkoutsEvents200,
	GetV1WorkoutsWorkoutid200,
	PostV1Workouts201,
	PostWorkoutsRequestBody,
	PostWorkoutsRequestExercise,
	PostWorkoutsRequestSetRpeEnumKey,
	PostWorkoutsRequestSetTypeEnumKey,
	PutV1WorkoutsWorkoutid200,
} from "../generated/client/types/index.js";
import { withObservability } from "../utils/observability-wrapper.js";
import { formatWorkout } from "../utils/formatters.js";
import type { HevyClient } from "../utils/hevyClient.js";
import { parseJsonArray } from "../utils/json-parser.js";
import {
	confirmMutation,
	type MutationToolOptions,
} from "../utils/mutation-confirmation.js";
import {
	workoutCountOutputSchema,
	workoutEventsOutputSchema,
	workoutOutputSchema,
	workoutsOutputSchema,
} from "../utils/output-schemas.js";
import {
	createEmptyResponse,
	createJsonResponse,
	createStructuredEmptyResponse,
	createStructuredJsonResponse,
} from "../utils/response-formatter.js";
import {
	createAnnotations,
	readOnlyAnnotations,
	updateAnnotations,
} from "../utils/tool-annotations.js";
import { describeTool } from "../utils/tool-descriptions.js";
import { requireClient, type InferToolParams } from "../utils/tool-helpers.js";
import { setTypeEnum } from "../utils/schemas.js";

/**
 * Register all workout-related tools with the MCP server
 */
export function registerWorkoutTools(
	server: McpServer,
	hevyClient: HevyClient | null,
	options: MutationToolOptions = {},
) {
	// Get workouts
	const getWorkoutsSchema = {
		page: z.coerce.number().gte(1).default(1),
		pageSize: z.coerce.number().int().gte(1).lte(10).default(5),
	} as const;
	type GetWorkoutsParams = InferToolParams<typeof getWorkoutsSchema>;

	server.registerTool(
		"get-workouts",
		{
			description: describeTool({
				summary:
					"Read-only. Lists workouts from newest to oldest with exercise and timing details.",
				aliases: [
					"list workout history",
					"show recent workouts",
					"browse logs",
				],
				useCase:
					"Use to browse or page through workout history; use get-workout when a workout ID is already known.",
				importantNotes:
					"Results are paginated; page starts at 1 and pageSize is limited to 10.",
			}),
			inputSchema: getWorkoutsSchema,
			outputSchema: workoutsOutputSchema,
			annotations: readOnlyAnnotations("Get Workouts"),
		},
		withObservability(async (args: GetWorkoutsParams) => {
			const client = requireClient(hevyClient);
			const { page, pageSize } = args;
			const data: GetV1Workouts200 = await client.getWorkouts({
				page,
				pageSize,
			});

			const workouts =
				data?.workouts?.map((workout) => formatWorkout(workout)) || [];

			if (workouts.length === 0) {
				return createStructuredEmptyResponse(
					"No workouts found for the specified parameters",
					{ workouts: [] },
				);
			}

			return createStructuredJsonResponse(workouts, { workouts });
		}, "get-workouts"),
	);

	// Get single workout by ID
	const getWorkoutSchema = {
		workoutId: z.string().min(1),
	} as const;
	type GetWorkoutParams = InferToolParams<typeof getWorkoutSchema>;

	server.registerTool(
		"get-workout",
		{
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
			outputSchema: workoutOutputSchema,
			annotations: readOnlyAnnotations("Get Workout"),
		},
		withObservability(async (args: GetWorkoutParams) => {
			const client = requireClient(hevyClient);
			const { workoutId } = args;
			const data: GetV1WorkoutsWorkoutid200 =
				await client.getWorkout(workoutId);

			if (!data) {
				return createStructuredEmptyResponse(
					`Workout with ID ${workoutId} not found`,
					{ workout: null },
				);
			}

			const workout = formatWorkout(data);
			return createStructuredJsonResponse(workout, { workout });
		}, "get-workout"),
	);

	// Get workout count
	server.registerTool(
		"get-workout-count",
		{
			description: describeTool({
				summary: "Read-only. Returns the total workout count for the account.",
				aliases: ["count workouts", "how many workouts", "workout total"],
				useCase:
					"Use for totals, statistics, or estimating pages; use get-workouts for actual workout records.",
				importantNotes:
					"Returns only a count and accepts no paging or date filters.",
			}),
			inputSchema: {},
			outputSchema: workoutCountOutputSchema,
			annotations: readOnlyAnnotations("Get Workout Count"),
		},
		withObservability(async () => {
			const client = requireClient(hevyClient);
			const data: GetV1WorkoutsCount200 = await client.getWorkoutCount();
			const count = data?.workout_count ?? 0;
			return createStructuredJsonResponse({ count }, { count });
		}, "get-workout-count"),
	);

	// Get workout events (updates/deletes)
	const getWorkoutEventsSchema = {
		page: z.coerce.number().int().gte(1).default(1),
		pageSize: z.coerce.number().int().gte(1).lte(10).default(5),
		since: z.string().default("1970-01-01T00:00:00Z"),
	} as const;
	type GetWorkoutEventsParams = InferToolParams<typeof getWorkoutEventsSchema>;

	server.registerTool(
		"get-workout-events",
		{
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
			outputSchema: workoutEventsOutputSchema,
			annotations: readOnlyAnnotations("Get Workout Events"),
		},
		withObservability(async (args: GetWorkoutEventsParams) => {
			const client = requireClient(hevyClient);
			const { page, pageSize, since } = args;
			const data: GetV1WorkoutsEvents200 = await client.getWorkoutEvents({
				page,
				pageSize,
				since,
			});

			const events = data?.events || [];

			if (events.length === 0) {
				return createStructuredEmptyResponse(
					`No workout events found for the specified parameters since ${since}`,
					{ events: [] },
				);
			}

			return createStructuredJsonResponse(events, { events });
		}, "get-workout-events"),
	);

	// Create workout
	const createWorkoutSchema = {
		title: z.string().min(1),
		description: z.string().optional().nullable(),
		startTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
		endTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
		isPrivate: z.boolean().default(false),
		exercises: z.preprocess(
			parseJsonArray,
			z.array(
				z.object({
					exerciseTemplateId: z.string().min(1),
					supersetId: z.coerce.number().nullable().optional(),
					notes: z.string().optional().nullable(),
					sets: z.array(
						z.object({
							type: setTypeEnum,
							weight: z.coerce.number().optional().nullable(),
							weightKg: z.coerce.number().optional().nullable(),
							reps: z.coerce.number().int().optional().nullable(),
							distance: z.coerce.number().int().optional().nullable(),
							distanceMeters: z.coerce.number().int().optional().nullable(),
							duration: z.coerce.number().int().optional().nullable(),
							durationSeconds: z.coerce.number().int().optional().nullable(),
							rpe: z.coerce.number().optional().nullable(),
							customMetric: z.coerce.number().optional().nullable(),
						}),
					),
				}),
			),
		),
	} as const;
	type CreateWorkoutParams = InferToolParams<typeof createWorkoutSchema>;

	server.tool(
		"create-workout",
		describeTool({
			summary: "Writes to the Hevy account by creating a new workout.",
			aliases: ["log workout", "add workout", "record training session"],
			useCase:
				"Use to add a completed workout; use update-workout only when modifying an existing workout ID.",
			importantNotes:
				"Requires UTC startTime/endTime in YYYY-MM-DDTHH:mm:ssZ form and exercise template IDs. Retrying can create duplicates.",
		}),
		createWorkoutSchema,
		createAnnotations("Create Workout"),
		withObservability(async (args: CreateWorkoutParams) => {
			const { title, description, startTime, endTime, isPrivate, exercises } =
				args;
			const confirmation = await confirmMutation(server, {
				confirmMutations: options.confirmMutations,
				message: `Create workout '${title}' from ${startTime} to ${endTime} with ${exercises.length} exercises?`,
			});
			if (!confirmation.confirmed) return confirmation.response;

			const client = requireClient(hevyClient);
			const workoutPayload: NonNullable<PostWorkoutsRequestBody["workout"]> = {
				title,
				description: description ?? null,
				start_time: startTime,
				end_time: endTime,
				is_private: isPrivate,
				exercises: exercises.map(
					(exercise): PostWorkoutsRequestExercise => ({
						exercise_template_id: exercise.exerciseTemplateId,
						superset_id: exercise.supersetId ?? null,
						notes: exercise.notes ?? null,
						sets: exercise.sets.map((set) => ({
							type: set.type as PostWorkoutsRequestSetTypeEnumKey,
							weight_kg: set.weight ?? set.weightKg ?? null,
							reps: set.reps ?? null,
							distance_meters: set.distance ?? set.distanceMeters ?? null,
							duration_seconds: set.duration ?? set.durationSeconds ?? null,
							rpe: (set.rpe as PostWorkoutsRequestSetRpeEnumKey | null) ?? null,
							custom_metric: set.customMetric ?? null,
						})),
					}),
				),
			};
			const requestBody: PostWorkoutsRequestBody = { workout: workoutPayload };

			const data: PostV1Workouts201 = await client.createWorkout(requestBody);

			if (!data) {
				return createEmptyResponse(
					"Failed to create workout: Server returned no data",
				);
			}

			const workout = formatWorkout(data);
			return createJsonResponse(workout, {
				pretty: true,
				indent: 2,
			});
		}, "create-workout"),
	);

	// Update workout
	const updateWorkoutSchema = {
		workoutId: z.string().min(1),
		title: z.string().min(1),
		description: z.string().optional().nullable(),
		startTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
		endTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
		isPrivate: z.boolean().default(false),
		exercises: z.preprocess(
			parseJsonArray,
			z.array(
				z.object({
					exerciseTemplateId: z.string().min(1),
					supersetId: z.coerce.number().nullable().optional(),
					notes: z.string().optional().nullable(),
					sets: z.array(
						z.object({
							type: setTypeEnum,
							weight: z.coerce.number().optional().nullable(),
							weightKg: z.coerce.number().optional().nullable(),
							reps: z.coerce.number().int().optional().nullable(),
							distance: z.coerce.number().int().optional().nullable(),
							distanceMeters: z.coerce.number().int().optional().nullable(),
							duration: z.coerce.number().int().optional().nullable(),
							durationSeconds: z.coerce.number().int().optional().nullable(),
							rpe: z.coerce.number().optional().nullable(),
							customMetric: z.coerce.number().optional().nullable(),
						}),
					),
				}),
			),
		),
	} as const;
	type UpdateWorkoutParams = InferToolParams<typeof updateWorkoutSchema>;

	server.tool(
		"update-workout",
		describeTool({
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
		updateWorkoutSchema,
		updateAnnotations("Update Workout"),
		withObservability(async (args: UpdateWorkoutParams) => {
			const {
				workoutId,
				title,
				description,
				startTime,
				endTime,
				isPrivate,
				exercises,
			} = args;
			const confirmation = await confirmMutation(server, {
				confirmMutations: options.confirmMutations,
				message: `Update workout ${workoutId} to '${title}' from ${startTime} to ${endTime} with ${exercises.length} exercises?`,
			});
			if (!confirmation.confirmed) return confirmation.response;

			const client = requireClient(hevyClient);
			const workoutPayload: NonNullable<PostWorkoutsRequestBody["workout"]> = {
				title,
				description: description ?? null,
				start_time: startTime,
				end_time: endTime,
				is_private: isPrivate,
				exercises: exercises.map(
					(exercise): PostWorkoutsRequestExercise => ({
						exercise_template_id: exercise.exerciseTemplateId,
						superset_id: exercise.supersetId ?? null,
						notes: exercise.notes ?? null,
						sets: exercise.sets.map((set) => ({
							type: set.type as PostWorkoutsRequestSetTypeEnumKey,
							weight_kg: set.weight ?? set.weightKg ?? null,
							reps: set.reps ?? null,
							distance_meters: set.distance ?? set.distanceMeters ?? null,
							duration_seconds: set.duration ?? set.durationSeconds ?? null,
							rpe: (set.rpe as PostWorkoutsRequestSetRpeEnumKey | null) ?? null,
							custom_metric: set.customMetric ?? null,
						})),
					}),
				),
			};
			const requestBody: PostWorkoutsRequestBody = { workout: workoutPayload };

			const data: PutV1WorkoutsWorkoutid200 = await client.updateWorkout(
				workoutId,
				requestBody,
			);

			if (!data) {
				return createEmptyResponse(
					`Failed to update workout with ID ${workoutId}`,
				);
			}

			const workout = formatWorkout(data);
			return createJsonResponse(workout, {
				pretty: true,
				indent: 2,
			});
		}, "update-workout-operation"),
	);
}
