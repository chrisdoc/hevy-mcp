import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
	PostWorkoutsRequestBody,
	PostWorkoutsRequestExercise,
	PostWorkoutsRequestSetRpeEnumKey,
	PostWorkoutsRequestSetTypeEnumKey,
} from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { formatWorkout } from "../utils/formatters.js";
import type { HevyClient } from "../utils/hevyClient.js";
import {
	createEmptyResponse,
	createJsonResponse,
} from "../utils/response-formatter.js";
import type { InferToolParams } from "../utils/tool-helpers.js";

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

	server.tool(
		"get-workouts",
		"Get a paginated list of workouts. Returns workout details including title, description, start/end times, and exercises performed. Results are ordered from newest to oldest.",
		getWorkoutsSchema,
		withErrorHandling(async (args: GetWorkoutsParams) => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			const { page, pageSize } = args;
			const data = await hevyClient.getWorkouts({
				page,
				pageSize,
			});

			const workouts =
				data?.workouts?.map((workout) => formatWorkout(workout)) || [];

			if (workouts.length === 0) {
				return createEmptyResponse(
					"No workouts found for the specified parameters",
				);
			}

			return createJsonResponse(workouts);
		}, "get-workouts"),
	);

	// Get single workout by ID
	const getWorkoutSchema = {
		workoutId: z.string().min(1),
	} as const;
	type GetWorkoutParams = InferToolParams<typeof getWorkoutSchema>;

	server.tool(
		"get-workout",
		"Get complete details of a specific workout by ID. Returns all workout information including title, description, start/end times, and detailed exercise data.",
		getWorkoutSchema,
		withErrorHandling(async (args: GetWorkoutParams) => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			const { workoutId } = args;
			const data = await hevyClient.getWorkout(workoutId);

			if (!data) {
				return createEmptyResponse(`Workout with ID ${workoutId} not found`);
			}

			const workout = formatWorkout(data);
			return createJsonResponse(workout);
		}, "get-workout"),
	);

	// Get workout count
	server.tool(
		"get-workout-count",
		"Get the total number of workouts on the account. Useful for pagination or statistics.",
		{},
		withErrorHandling(async () => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			const data = await hevyClient.getWorkoutCount();
			const count = data
				? (data as { workoutCount?: number }).workoutCount || 0
				: 0;
			return createJsonResponse({ count });
		}, "get-workout-count"),
	);

	// Get workout events (updates/deletes)
	const getWorkoutEventsSchema = {
		page: z.coerce.number().int().gte(1).default(1),
		pageSize: z.coerce.number().int().gte(1).lte(10).default(5),
		since: z.string().default("1970-01-01T00:00:00Z"),
	} as const;
	type GetWorkoutEventsParams = InferToolParams<typeof getWorkoutEventsSchema>;

	server.tool(
		"get-workout-events",
		"Retrieve a paged list of workout events (updates or deletes) since a given date. Events are ordered from newest to oldest. The intention is to allow clients to keep their local cache of workouts up to date without having to fetch the entire list of workouts.",
		getWorkoutEventsSchema,
		withErrorHandling(async (args: GetWorkoutEventsParams) => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			const { page, pageSize, since } = args;
			const data = await hevyClient.getWorkoutEvents({
				page,
				pageSize,
				since,
			});

			const events = data?.events || [];

			if (events.length === 0) {
				return createEmptyResponse(
					`No workout events found for the specified parameters since ${since}`,
				);
			}

			return createJsonResponse(events);
		}, "get-workout-events"),
	);

	// Create workout
	const createWorkoutSchema = {
		title: z.string().min(1),
		description: z.string().optional().nullable(),
		startTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
		endTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
		isPrivate: z.boolean().default(false),
		exercises: z.array(
			z.object({
				exerciseTemplateId: z.string().min(1),
				supersetId: z.coerce.number().nullable().optional(),
				notes: z.string().optional().nullable(),
				sets: z.array(
					z.object({
						type: z
							.enum(["warmup", "normal", "failure", "dropset"])
							.default("normal"),
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
	} as const;
	type CreateWorkoutParams = InferToolParams<typeof createWorkoutSchema>;

	server.tool(
		"create-workout",
		"Create a new workout in your Hevy account. Requires title, start/end times, and at least one exercise with sets. Returns the complete workout details upon successful creation including the newly assigned workout ID.",
		createWorkoutSchema,
		withErrorHandling(async (args: CreateWorkoutParams) => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			const { title, description, startTime, endTime, isPrivate, exercises } =
				args;
			const workoutPayload: NonNullable<PostWorkoutsRequestBody["workout"]> = {
				title,
				description: description || null,
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

			const data = await hevyClient.createWorkout(requestBody);

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
		exercises: z.array(
			z.object({
				exerciseTemplateId: z.string().min(1),
				supersetId: z.coerce.number().nullable().optional(),
				notes: z.string().optional().nullable(),
				sets: z.array(
					z.object({
						type: z
							.enum(["warmup", "normal", "failure", "dropset"])
							.default("normal"),
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
	} as const;
	type UpdateWorkoutParams = InferToolParams<typeof updateWorkoutSchema>;

	server.tool(
		"update-workout",
		"Update an existing workout by ID. You can modify the title, description, start/end times, privacy setting, and exercise data. Returns the updated workout with all changes applied.",
		updateWorkoutSchema,
		withErrorHandling(async (args: UpdateWorkoutParams) => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
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
				description: description || null,
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

			const data = await hevyClient.updateWorkout(workoutId, requestBody);

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
