import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
// Import types from generated client
import type {
	GetV1Routines200,
	GetV1RoutinesRoutineid200,
	PostRoutinesRequestExercise,
	PostRoutinesRequestSet,
	PostRoutinesRequestSetTypeEnumKey,
	PostV1Routines201,
	PutRoutinesRequestExercise,
	PutRoutinesRequestSet,
	PutRoutinesRequestSetTypeEnumKey,
	PutV1RoutinesRoutineid200,
} from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import type { HevyClient } from "../utils/hevyClient.js";
import { parseJsonArray } from "../utils/json-parser.js";
import {
	createRoutineResponse,
	respond,
	routineResponse,
	routinesResponse,
	updateRoutineResponse,
} from "../utils/response-formatter.js";
import {
	createAnnotations,
	readOnlyAnnotations,
	updateAnnotations,
} from "../utils/tool-annotations.js";
import { describeTool } from "../utils/tool-descriptions.js";
import { requireClient, type InferToolParams } from "../utils/tool-helpers.js";
import {
	setTypeEnum,
	zNullableInt,
	zOptionalRepRange,
} from "../utils/schemas.js";

function buildRepRange(repRange?: {
	start?: number | null;
	end?: number | null;
}): { start?: number; end?: number } | null {
	if (!repRange) {
		return null;
	}

	const start = repRange.start ?? undefined;
	const end = repRange.end ?? undefined;
	if (start === undefined && end === undefined) {
		return null;
	}

	return { start, end };
}

/**
 * Returns a fixed rep count when `repRange` is a fixed range (start and end are
 * both non-null and equal). Otherwise returns null.
 */
function getFixedRepsFromRepRange(
	repRange:
		| {
				start?: number | null;
				end?: number | null;
		  }
		| null
		| undefined,
): number | null {
	if (!repRange) {
		return null;
	}

	const start = repRange.start ?? null;
	const end = repRange.end ?? null;
	if (start === null || end === null) {
		return null;
	}
	if (start !== end) {
		return null;
	}

	return start;
}

/**
 * Register all routine-related tools with the MCP server
 */
export function registerRoutineTools(
	server: McpServer,
	hevyClient: HevyClient | null,
	wrapHandler: typeof withErrorHandling = withErrorHandling,
) {
	// Get routines
	const getRoutinesSchema = {
		page: z.coerce.number().int().gte(1).default(1),
		pageSize: z.coerce.number().int().gte(1).lte(10).default(5),
	} as const;
	type GetRoutinesParams = InferToolParams<typeof getRoutinesSchema>;

	server.registerTool(
		"get-routines",
		{
			description: describeTool({
				summary: "Read-only. Lists custom and default workout routines.",
				aliases: [
					"list routines",
					"show workout plans",
					"browse saved routines",
				],
				useCase:
					"Use to browse routines or discover a routine ID; use get-routine for one known routine.",
				importantNotes:
					"Results are paginated; page starts at 1 and pageSize is limited to 10.",
			}),
			inputSchema: getRoutinesSchema,
			outputSchema: routinesResponse.outputSchema,
			annotations: readOnlyAnnotations("Get Routines"),
		},
		wrapHandler(async (args: GetRoutinesParams) => {
			const client = requireClient(hevyClient);
			const { page, pageSize } = args;
			const data: GetV1Routines200 = await client.getRoutines({
				page,
				pageSize,
			});

			return respond(routinesResponse, data?.routines);
		}, "get-routines"),
	);

	// Get single routine by ID (new, direct endpoint)
	const getRoutineSchema = {
		routineId: z.string().min(1),
	} as const;
	type GetRoutineParams = InferToolParams<typeof getRoutineSchema>;

	server.registerTool(
		"get-routine",
		{
			description: describeTool({
				summary:
					"Read-only. Retrieves one routine and its exercise configuration by ID.",
				aliases: ["show routine", "fetch workout plan", "routine details"],
				useCase:
					"Use when the routineId is known; use get-routines to browse or discover IDs.",
				importantNotes:
					"Requires a routineId from get-routines or a prior create response.",
			}),
			inputSchema: getRoutineSchema,
			outputSchema: routineResponse.outputSchema,
			annotations: readOnlyAnnotations("Get Routine"),
		},
		wrapHandler(async (args: GetRoutineParams) => {
			const client = requireClient(hevyClient);
			const { routineId } = args;
			const data: GetV1RoutinesRoutineid200 = await client.getRoutineById(
				String(routineId),
			);
			return respond(routineResponse, {
				routine: data?.routine,
				routineId,
			});
		}, "get-routine"),
	);

	// Create new routine
	const createRoutineSchema = {
		title: z.string().min(1),
		folderId: z.coerce.number().nullable().optional(),
		notes: z.string().optional(),
		exercises: z.preprocess(
			parseJsonArray,
			z.array(
				z.object({
					exerciseTemplateId: z.string().min(1),
					supersetId: z.coerce.number().nullable().optional(),
					restSeconds: z.coerce.number().int().min(0).optional(),
					notes: z.string().optional(),
					sets: z.array(
						z.object({
							type: setTypeEnum,
							weight: z.coerce.number().optional(),
							weightKg: z.coerce.number().optional(),
							reps: zNullableInt,
							distance: z.coerce.number().int().optional(),
							distanceMeters: z.coerce.number().int().optional(),
							duration: z.coerce.number().int().optional(),
							durationSeconds: z.coerce.number().int().optional(),
							customMetric: z.coerce.number().optional(),
							repRange: zOptionalRepRange,
						}),
					),
				}),
			),
		),
	} as const;
	type CreateRoutineParams = InferToolParams<typeof createRoutineSchema>;

	server.tool(
		"create-routine",
		describeTool({
			summary: "Writes to the Hevy account by creating a new workout routine.",
			aliases: ["add routine", "build workout plan", "save training template"],
			useCase:
				"Use to create a reusable plan; use create-workout to log a completed session.",
			importantNotes:
				"Requires exercise template IDs; folderId is optional. Retrying can create duplicates, and non-fixed rep ranges may not display in Hevy apps.",
		}),
		createRoutineSchema,
		createAnnotations("Create Routine"),
		wrapHandler(async (args: CreateRoutineParams) => {
			const client = requireClient(hevyClient);
			const { title, folderId, notes, exercises } = args;
			let usesRepRanges = false;
			const data: PostV1Routines201 = await client.createRoutine({
				routine: {
					title,
					folder_id: folderId ?? null,
					notes: notes ?? "",
					exercises: exercises.map((exercise): PostRoutinesRequestExercise => {
						const sets = exercise.sets.map((set): PostRoutinesRequestSet => {
							const repRange = buildRepRange(set.repRange);
							const fixedReps = getFixedRepsFromRepRange(repRange);
							const reps = typeof set.reps === "number" ? set.reps : fixedReps;
							return {
								type: set.type as PostRoutinesRequestSetTypeEnumKey,
								weight_kg: set.weight ?? set.weightKg ?? null,
								reps: reps ?? null,
								distance_meters: set.distance ?? set.distanceMeters ?? null,
								duration_seconds: set.duration ?? set.durationSeconds ?? null,
								custom_metric: set.customMetric ?? null,
								rep_range: repRange,
							};
						});

						if (
							sets.some(
								(set) =>
									set.rep_range != null &&
									getFixedRepsFromRepRange(set.rep_range) === null,
							)
						) {
							usesRepRanges = true;
						}

						return {
							exercise_template_id: exercise.exerciseTemplateId,
							superset_id: exercise.supersetId ?? null,
							rest_seconds: exercise.restSeconds ?? null,
							notes: exercise.notes ?? null,
							sets,
						};
					}),
				},
			});

			return respond(createRoutineResponse, {
				routine: data,
				usesRepRanges,
			});
		}, "create-routine"),
	);

	// Update existing routine
	const updateRoutineSchema = {
		routineId: z.string().min(1),
		title: z.string().min(1),
		notes: z.string().optional(),
		exercises: z.preprocess(
			parseJsonArray,
			z.array(
				z.object({
					exerciseTemplateId: z.string().min(1),
					supersetId: z.coerce.number().nullable().optional(),
					restSeconds: z.coerce.number().int().min(0).optional(),
					notes: z.string().optional(),
					sets: z.array(
						z.object({
							type: setTypeEnum,
							weight: z.coerce.number().optional(),
							weightKg: z.coerce.number().optional(),
							reps: zNullableInt,
							distance: z.coerce.number().int().optional(),
							distanceMeters: z.coerce.number().int().optional(),
							duration: z.coerce.number().int().optional(),
							durationSeconds: z.coerce.number().int().optional(),
							customMetric: z.coerce.number().optional(),
							repRange: zOptionalRepRange,
						}),
					),
				}),
			),
		),
	} as const;
	type UpdateRoutineParams = InferToolParams<typeof updateRoutineSchema>;

	server.tool(
		"update-routine",
		describeTool({
			summary:
				"Mutates the Hevy account by replacing an existing routine's content.",
			aliases: [
				"edit routine",
				"revise workout plan",
				"replace routine exercises",
			],
			useCase:
				"Use to change a known routine; use create-routine for a separate new plan.",
			importantNotes:
				"Requires routineId and the complete title and exercises payload; omitted exercises are removed. Non-fixed rep ranges may not display in Hevy apps.",
		}),
		updateRoutineSchema,
		updateAnnotations("Update Routine"),
		wrapHandler(async (args: UpdateRoutineParams) => {
			const client = requireClient(hevyClient);
			const { routineId, title, notes, exercises } = args;
			let usesRepRanges = false;
			const data: PutV1RoutinesRoutineid200 = await client.updateRoutine(
				routineId,
				{
					routine: {
						title,
						notes: notes ?? null,
						exercises: exercises.map((exercise): PutRoutinesRequestExercise => {
							const sets = exercise.sets.map((set): PutRoutinesRequestSet => {
								const repRange = buildRepRange(set.repRange);
								const fixedReps = getFixedRepsFromRepRange(repRange);
								const reps =
									typeof set.reps === "number" ? set.reps : fixedReps;
								return {
									type: set.type as PutRoutinesRequestSetTypeEnumKey,
									weight_kg: set.weight ?? set.weightKg ?? null,
									reps: reps ?? null,
									distance_meters: set.distance ?? set.distanceMeters ?? null,
									duration_seconds: set.duration ?? set.durationSeconds ?? null,
									custom_metric: set.customMetric ?? null,
									...(repRange ? { rep_range: repRange } : {}),
								};
							});

							if (
								sets.some(
									(set) =>
										set.rep_range != null &&
										getFixedRepsFromRepRange(set.rep_range) === null,
								)
							) {
								usesRepRanges = true;
							}

							return {
								exercise_template_id: exercise.exerciseTemplateId,
								superset_id: exercise.supersetId ?? null,
								rest_seconds: exercise.restSeconds ?? null,
								notes: exercise.notes ?? null,
								sets,
							};
						}),
					},
				},
			);

			return respond(updateRoutineResponse, {
				routine: data,
				routineId,
				usesRepRanges,
			});
		}, "update-routine"),
	);
}
