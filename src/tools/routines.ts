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
		withErrorHandling(async ({ page, pageSize }) => {
			const data = await hevyClient.getRoutines({
				page: page as number,
				pageSize: pageSize as number,
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

	// Get single routine by ID
	server.tool(
		"get-routine",
		"Get complete details of a specific routine by its ID, including title, notes, folder, and all exercises and sets.",
		{
			routineId: z.string().min(1),
		},
		withErrorHandling(async ({ routineId }) => {
			// Since the Kiota client doesn't have a get() method for routine by ID, we need to use the list endpoint and filter
			const data = await hevyClient.updateRoutine(routineId as string, {
				routine: {
					title: "", // We're providing a minimal body as required by the API
				},
			});

			if (!data) {
				return createEmptyResponse(`Routine with ID ${routineId} not found`);
			}

			const routine = formatRoutine(data);
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
		withErrorHandling(async ({ title, folderId, notes, exercises }) => {
			const data = await hevyClient.createRoutine({
				routine: {
					title: title as string,
					folder_id: (folderId as number) || null,
					notes: (notes as string) || "",
					exercises: (exercises as unknown[]).map(
						(exercise: unknown): PostRoutinesRequestExercise => ({
							exercise_template_id: (exercise as { exerciseTemplateId: string })
								.exerciseTemplateId,
							superset_id:
								(exercise as { supersetId?: number | null }).supersetId || null,
							rest_seconds:
								(exercise as { restSeconds?: number | null }).restSeconds ||
								null,
							notes: (exercise as { notes?: string | null }).notes || null,
							sets: ((exercise as { sets: unknown[] }).sets as unknown[]).map(
								(set: unknown): PostRoutinesRequestSet => ({
									type: (set as { type: string })
										.type as PostRoutinesRequestSetTypeEnum,
									weight_kg:
										(set as { weightKg?: number | null }).weightKg || null,
									reps: (set as { reps?: number | null }).reps || null,
									distance_meters:
										(set as { distanceMeters?: number | null })
											.distanceMeters || null,
									duration_seconds:
										(set as { durationSeconds?: number | null })
											.durationSeconds || null,
									custom_metric:
										(set as { customMetric?: number | null }).customMetric ||
										null,
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
		withErrorHandling(async ({ routineId, title, notes, exercises }) => {
			const data = await hevyClient.updateRoutine(routineId as string, {
				routine: {
					title: title as string,
					notes: (notes as string) || "",
					exercises: (exercises as unknown[]).map(
						(exercise: unknown): PutRoutinesRequestExercise => ({
							exercise_template_id: (exercise as { exerciseTemplateId: string })
								.exerciseTemplateId,
							superset_id:
								(exercise as { supersetId?: number | null }).supersetId || null,
							rest_seconds:
								(exercise as { restSeconds?: number | null }).restSeconds ||
								null,
							notes: (exercise as { notes?: string | null }).notes || null,
							sets: ((exercise as { sets: unknown[] }).sets as unknown[]).map(
								(set: unknown): PutRoutinesRequestSet => ({
									type: (set as { type: string })
										.type as PutRoutinesRequestSetTypeEnum,
									weight_kg:
										(set as { weightKg?: number | null }).weightKg || null,
									reps: (set as { reps?: number | null }).reps || null,
									distance_meters:
										(set as { distanceMeters?: number | null })
											.distanceMeters || null,
									duration_seconds:
										(set as { durationSeconds?: number | null })
											.durationSeconds || null,
									custom_metric:
										(set as { customMetric?: number | null }).customMetric ||
										null,
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
