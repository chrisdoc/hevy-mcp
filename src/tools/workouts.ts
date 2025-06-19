import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HevyClient } from "../generated/client/hevyClient.js";
import type { PostWorkoutsRequestBody } from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { formatWorkout } from "../utils/formatters.js";
import {
	createEmptyResponse,
	createJsonResponse,
} from "../utils/response-formatter.js";

/**
 * Type definition for exercise set types
 */
type SetType = "warmup" | "normal" | "failure" | "dropset";

/**
 * Interface for exercise set input
 */
interface ExerciseSetInput {
	type: SetType;
	weightKg?: number | null;
	reps?: number | null;
	distanceMeters?: number | null;
	durationSeconds?: number | null;
	rpe?: number | null;
	customMetric?: number | null;
}

/**
 * Interface for exercise input
 */
interface ExerciseInput {
	exerciseTemplateId: string;
	supersetId?: number | null;
	notes?: string | null;
	sets: ExerciseSetInput[];
}

/**
 * Register all workout-related tools with the MCP server
 */
export function registerWorkoutTools(
	server: McpServer,
	hevyClient: HevyClient,
) {
	// Get workouts
	server.tool(
		"get-workouts",
		"Get a paginated list of workouts. Returns workout details including title, description, start/end times, and exercises performed. Results are ordered from newest to oldest.",
		{
			page: z.coerce.number().gte(1).default(1),
			pageSize: z.coerce.number().int().gte(1).lte(10).default(5),
		},
		withErrorHandling(async ({ page, pageSize }) => {
			const data = await hevyClient.getWorkouts({
				page,
				pageSize,
			});

			// Process workouts to extract relevant information
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
	server.tool(
		"get-workout",
		"Get complete details of a specific workout by ID. Returns all workout information including title, description, start/end times, and detailed exercise data.",
		{
			workoutId: z.string().min(1),
		},
		withErrorHandling(async ({ workoutId }) => {
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
			const data = await hevyClient.getWorkoutCount();
			// Use type assertion to access count property
			const count = data
				? (data as { workoutCount?: number }).workoutCount || 0
				: 0;
			return createJsonResponse({ count });
		}, "get-workout-count"),
	);

	// Get workout events (updates/deletes)
	server.tool(
		"get-workout-events",
		"Retrieve a paged list of workout events (updates or deletes) since a given date. Events are ordered from newest to oldest. The intention is to allow clients to keep their local cache of workouts up to date without having to fetch the entire list of workouts.",
		{
			page: z.coerce.number().int().gte(1).default(1),
			pageSize: z.coerce.number().int().gte(1).lte(10).default(5),
			since: z.string().default("1970-01-01T00:00:00Z"),
		},
		withErrorHandling(async ({ page, pageSize, since }) => {
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
	server.tool(
		"create-workout",
		"Create a new workout in your Hevy account. Requires title, start/end times, and at least one exercise with sets. Returns the complete workout details upon successful creation including the newly assigned workout ID.",
		{
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
							weightKg: z.coerce.number().optional().nullable(),
							reps: z.coerce.number().int().optional().nullable(),
							distanceMeters: z.coerce.number().int().optional().nullable(),
							durationSeconds: z.coerce.number().int().optional().nullable(),
							rpe: z.coerce.number().optional().nullable(),
							customMetric: z.coerce.number().optional().nullable(),
						}),
					),
				}),
			),
		},
		withErrorHandling(
			async ({
				title,
				description,
				startTime,
				endTime,
				isPrivate,
				exercises,
			}) => {
				const requestBody: PostWorkoutsRequestBody = {
					workout: {
						title,
						description: description || null,
						startTime,
						endTime,
						isPrivate,
						exercises: exercises.map((exercise: ExerciseInput) => ({
							exerciseTemplateId: exercise.exerciseTemplateId,
							supersetId: exercise.supersetId || null,
							notes: exercise.notes || null,
							sets: exercise.sets.map((set: ExerciseSetInput) => ({
								type: set.type,
								weightKg: set.weightKg || null,
								reps: set.reps || null,
								distanceMeters: set.distanceMeters || null,
								durationSeconds: set.durationSeconds || null,
								rpe: set.rpe || null,
								customMetric: set.customMetric || null,
							})),
						})),
					},
				};

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
			},
			"create-workout",
		),
	);

	// Update workout
	server.tool(
		"update-workout",
		"Update an existing workout by ID. You can modify the title, description, start/end times, privacy setting, and exercise data. Returns the updated workout with all changes applied.",
		{
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
							weightKg: z.coerce.number().optional().nullable(),
							reps: z.coerce.number().int().optional().nullable(),
							distanceMeters: z.coerce.number().int().optional().nullable(),
							durationSeconds: z.coerce.number().int().optional().nullable(),
							rpe: z.coerce.number().optional().nullable(),
							customMetric: z.coerce.number().optional().nullable(),
						}),
					),
				}),
			),
		},
		withErrorHandling(
			async ({
				workoutId,
				title,
				description,
				startTime,
				endTime,
				isPrivate,
				exercises,
			}) => {
				const requestBody: PostWorkoutsRequestBody = {
					workout: {
						title,
						description: description || null,
						startTime,
						endTime,
						isPrivate,
						exercises: exercises.map((exercise: ExerciseInput) => ({
							exerciseTemplateId: exercise.exerciseTemplateId,
							supersetId: exercise.supersetId || null,
							notes: exercise.notes || null,
							sets: exercise.sets.map((set: ExerciseSetInput) => ({
								type: set.type,
								weightKg: set.weightKg || null,
								reps: set.reps || null,
								distanceMeters: set.distanceMeters || null,
								durationSeconds: set.durationSeconds || null,
								rpe: set.rpe || null,
								customMetric: set.customMetric || null,
							})),
						})),
					},
				};

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
			},
			"update-workout-operation",
		),
	);
}
