import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
// Import types from generated client
import type {
	PostRoutinesRequestExercise,
	PostRoutinesRequestSet,
	PostRoutinesRequestSetTypeEnum,
	PutRoutinesRequestExercise,
	PutRoutinesRequestSet,
	PutRoutinesRequestSetTypeEnum,
	Routine,
} from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { formatRoutine } from "../utils/formatters.js";
import {
	createEmptyResponse,
	createJsonResponse,
} from "../utils/response-formatter.js";

// Type definitions for the routine operations
type HevyClient = ReturnType<
	typeof import("../utils/hevyClientKubb.js").createClient
>;

// Define types for the routine operations based on Zod schemas
type CreateRoutineParams = {
	title: string;
	folderId?: number | null;
	notes?: string;
	exercises: Array<{
		exerciseTemplateId: string;
		supersetId?: number | null;
		restSeconds?: number;
		notes?: string;
		sets: Array<{
			type: "warmup" | "normal" | "failure" | "dropset";
			weightKg?: number;
			reps?: number;
			distanceMeters?: number;
			durationSeconds?: number;
			customMetric?: number;
		}>;
	}>;
};

type UpdateRoutineParams = {
	routineId: string;
	title: string;
	notes?: string;
	exercises: Array<{
		exerciseTemplateId: string;
		supersetId?: number | null;
		restSeconds?: number;
		notes?: string;
		sets: Array<{
			type: "warmup" | "normal" | "failure" | "dropset";
			weightKg?: number;
			reps?: number;
			distanceMeters?: number;
			durationSeconds?: number;
			customMetric?: number;
		}>;
	}>;
};

/**
 * Register all routine-related tools with the MCP server
 */
export function registerRoutineTools(
	server: McpServer,
	hevyClient: HevyClient,
) {
	// Get routines
	server.tool(
		"get-routines",
		"Get a paginated list of your workout routines, including custom and default routines. Useful for browsing or searching your available routines.",
		{
			page: z.coerce.number().int().gte(1).default(1),
			pageSize: z.coerce.number().int().gte(1).lte(10).default(5),
		},
		withErrorHandling(async (args) => {
			const { page, pageSize } = args as { page: number; pageSize: number };
			const data = await hevyClient.getRoutines({
				page,
				pageSize,
			});

			// Process routines to extract relevant information
			const routines =
				data?.routines?.map((routine: Routine) => formatRoutine(routine)) || [];

			if (routines.length === 0) {
				return createEmptyResponse(
					"No routines found for the specified parameters",
				);
			}

			return createJsonResponse(routines);
		}, "get-routines"),
	);

	// Get single routine by ID (new, direct endpoint)
	server.tool(
		"get-routine",
		"Get a routine by its ID using the direct endpoint. Returns all details for the specified routine.",
		{
			routineId: z.string().min(1),
		},
		withErrorHandling(async ({ routineId }) => {
			const data = await hevyClient.getRoutineById(String(routineId));
			if (!data || !data.routine) {
				return createEmptyResponse(`Routine with ID ${routineId} not found`);
			}
			const routine = formatRoutine(data.routine);
			return createJsonResponse(routine);
		}, "get-routine"),
	);

	// Create new routine
	server.tool(
		"create-routine",
		"Create a new workout routine in your Hevy account. Requires a title and at least one exercise with sets. Optionally assign to a folder. Returns the full routine details including the new routine ID.",
		{
			title: z.string().min(1),
			folderId: z.coerce.number().nullable().optional(),
			notes: z.string().optional(),
			exercises: z.array(
				z.object({
					exerciseTemplateId: z.string().min(1),
					supersetId: z.coerce.number().nullable().optional(),
					restSeconds: z.coerce.number().int().min(0).optional(),
					notes: z.string().optional(),
					sets: z.array(
						z.object({
							type: z
								.enum(["warmup", "normal", "failure", "dropset"])
								.default("normal"),
							weightKg: z.coerce.number().optional(),
							reps: z.coerce.number().int().optional(),
							distanceMeters: z.coerce.number().int().optional(),
							durationSeconds: z.coerce.number().int().optional(),
							customMetric: z.coerce.number().optional(),
						}),
					),
				}),
			),
		},
		withErrorHandling(async (args) => {
			const { title, folderId, notes, exercises } = args as CreateRoutineParams;
			const data = await hevyClient.createRoutine({
				routine: {
					title,
					folder_id: folderId ?? null,
					notes: notes ?? "",
					exercises: exercises.map(
						(exercise): PostRoutinesRequestExercise => ({
							exercise_template_id: exercise.exerciseTemplateId,
							superset_id: exercise.supersetId ?? null,
							rest_seconds: exercise.restSeconds ?? null,
							notes: exercise.notes ?? null,
							sets: exercise.sets.map(
								(set): PostRoutinesRequestSet => ({
									type: set.type as PostRoutinesRequestSetTypeEnum,
									weight_kg: set.weightKg ?? null,
									reps: set.reps ?? null,
									distance_meters: set.distanceMeters ?? null,
									duration_seconds: set.durationSeconds ?? null,
									custom_metric: set.customMetric ?? null,
								}),
							),
						}),
					),
				},
			});

			if (!data) {
				return createEmptyResponse(
					"Failed to create routine: Server returned no data",
				);
			}

			const routine = formatRoutine(data);
			return createJsonResponse(routine, {
				pretty: true,
				indent: 2,
			});
		}, "create-routine"),
	);

	// Update existing routine
	server.tool(
		"update-routine",
		"Update an existing routine by ID. You can modify the title, notes, and exercise configurations. Returns the updated routine with all changes applied.",
		{
			routineId: z.string().min(1),
			title: z.string().min(1),
			notes: z.string().optional(),
			exercises: z.array(
				z.object({
					exerciseTemplateId: z.string().min(1),
					supersetId: z.coerce.number().nullable().optional(),
					restSeconds: z.coerce.number().int().min(0).optional(),
					notes: z.string().optional(),
					sets: z.array(
						z.object({
							type: z
								.enum(["warmup", "normal", "failure", "dropset"])
								.default("normal"),
							weightKg: z.coerce.number().optional(),
							reps: z.coerce.number().int().optional(),
							distanceMeters: z.coerce.number().int().optional(),
							durationSeconds: z.coerce.number().int().optional(),
							customMetric: z.coerce.number().optional(),
						}),
					),
				}),
			),
		},
		withErrorHandling(async (args) => {
			const { routineId, title, notes, exercises } =
				args as UpdateRoutineParams;
			const data = await hevyClient.updateRoutine(routineId, {
				routine: {
					title,
					notes: notes ?? null,
					exercises: exercises.map(
						(exercise): PutRoutinesRequestExercise => ({
							exercise_template_id: exercise.exerciseTemplateId,
							superset_id: exercise.supersetId ?? null,
							rest_seconds: exercise.restSeconds ?? null,
							notes: exercise.notes ?? null,
							sets: exercise.sets.map(
								(set): PutRoutinesRequestSet => ({
									type: set.type as PutRoutinesRequestSetTypeEnum,
									weight_kg: set.weightKg ?? null,
									reps: set.reps ?? null,
									distance_meters: set.distanceMeters ?? null,
									duration_seconds: set.durationSeconds ?? null,
									custom_metric: set.customMetric ?? null,
								}),
							),
						}),
					),
				},
			});

			if (!data) {
				return createEmptyResponse(
					`Failed to update routine with ID ${routineId}`,
				);
			}

			const routine = formatRoutine(data);
			return createJsonResponse(routine, {
				pretty: true,
				indent: 2,
			});
		}, "update-routine"),
	);
}
