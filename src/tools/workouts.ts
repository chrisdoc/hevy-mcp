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
import { withErrorHandling } from "../utils/error-handler.js";
import { formatWorkout } from "../utils/formatters.js";
import type { HevyClient } from "../utils/hevyClient.js";
import { parseJsonArray } from "../utils/json-parser.js";
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
import { requireClient, type InferToolParams } from "../utils/tool-helpers.js";
import { setTypeEnum } from "../utils/schemas.js";

/**
 * Register all workout-related tools with the MCP server
 */
export function registerWorkoutTools(
	server: McpServer,
	hevyClient: HevyClient | null,
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
			description:
				"Get a paginated list of workouts. Returns workout details including title, description, start/end times, and exercises performed. Results are ordered from newest to oldest.",
			inputSchema: getWorkoutsSchema,
			outputSchema: workoutsOutputSchema,
			annotations: readOnlyAnnotations("Get Workouts"),
		},
		withErrorHandling(async (args: GetWorkoutsParams) => {
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
			description:
				"Get complete details of a specific workout by ID. Returns all workout information including title, description, start/end times, and detailed exercise data.",
			inputSchema: getWorkoutSchema,
			outputSchema: workoutOutputSchema,
			annotations: readOnlyAnnotations("Get Workout"),
		},
		withErrorHandling(async (args: GetWorkoutParams) => {
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
			description:
				"Get the total number of workouts on the account. Useful for pagination or statistics.",
			inputSchema: {},
			outputSchema: workoutCountOutputSchema,
			annotations: readOnlyAnnotations("Get Workout Count"),
		},
		withErrorHandling(async () => {
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
			description:
				"Retrieve a paged list of workout events (updates or deletes) since a given date. Events are ordered from newest to oldest. The intention is to allow clients to keep their local cache of workouts up to date without having to fetch the entire list of workouts.",
			inputSchema: getWorkoutEventsSchema,
			outputSchema: workoutEventsOutputSchema,
			annotations: readOnlyAnnotations("Get Workout Events"),
		},
		withErrorHandling(async (args: GetWorkoutEventsParams) => {
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
		"Create a new workout in your Hevy account. Requires title, start/end times, and at least one exercise with sets. Returns the complete workout details upon successful creation including the newly assigned workout ID.",
		createWorkoutSchema,
		createAnnotations("Create Workout"),
		withErrorHandling(async (args: CreateWorkoutParams) => {
			const client = requireClient(hevyClient);
			const { title, description, startTime, endTime, isPrivate, exercises } =
				args;
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
		"Update an existing workout by ID. You can modify the title, description, start/end times, privacy setting, and exercise data. Returns the updated workout with all changes applied.",
		updateWorkoutSchema,
		updateAnnotations("Update Workout"),
		withErrorHandling(async (args: UpdateWorkoutParams) => {
			const client = requireClient(hevyClient);
			const {
				workoutId,
				title,
				description,
				startTime,
				endTime,
				isPrivate,
				exercises,
			} = args;
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
