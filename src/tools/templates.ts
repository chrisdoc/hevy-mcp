import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
// Import types from generated client
import type {
	ExerciseTemplate,
	GetV1ExerciseHistoryExercisetemplateid200,
	GetV1ExerciseTemplates200,
	GetV1ExerciseTemplatesExercisetemplateid200,
	PostV1ExerciseTemplates200,
} from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import {
	formatExerciseHistoryEntry,
	formatExerciseTemplate,
} from "../utils/formatters.js";
import {
	createEmptyResponse,
	createJsonResponse,
} from "../utils/response-formatter.js";
import type { InferToolParams } from "../utils/tool-helpers.js";

// Type definitions for the template operations
type HevyClient = ReturnType<
	typeof import("../utils/hevyClientKubb.js").createClient
>;

// Shared muscle group values used by both create and search tools
const MUSCLE_GROUPS = [
	"abdominals",
	"shoulders",
	"biceps",
	"triceps",
	"forearms",
	"quadriceps",
	"hamstrings",
	"calves",
	"glutes",
	"abductors",
	"adductors",
	"lats",
	"upper_back",
	"traps",
	"lower_back",
	"chest",
	"cardio",
	"neck",
	"full_body",
	"other",
] as const;

// Module-level cache for all exercise templates
let exerciseTemplateCache: ExerciseTemplate[] | null = null;
// In-flight promise to prevent concurrent duplicate fetches
let exerciseTemplateFetch: Promise<ExerciseTemplate[]> | null = null;

/** Reset the exercise template cache (exposed for testing). */
export function resetExerciseTemplateCache(): void {
	exerciseTemplateCache = null;
	exerciseTemplateFetch = null;
}

/**
 * Register all exercise template-related tools with the MCP server
 */
export function registerTemplateTools(
	server: McpServer,
	hevyClient: HevyClient | null,
) {
	// Get exercise templates
	const getExerciseTemplatesSchema = {
		page: z.coerce.number().int().gte(1).default(1),
		pageSize: z.coerce.number().int().gte(1).lte(100).default(5),
	} as const;
	type GetExerciseTemplatesParams = InferToolParams<
		typeof getExerciseTemplatesSchema
	>;

	server.tool(
		"get-exercise-templates",
		"Get a paginated list of exercise templates (default and custom) with details like name, category, equipment, and muscle groups. Useful for browsing or searching available exercises.",
		getExerciseTemplatesSchema,
		withErrorHandling(async (args: GetExerciseTemplatesParams) => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			const { page, pageSize } = args;
			const data: GetV1ExerciseTemplates200 =
				await hevyClient.getExerciseTemplates({
					page,
					pageSize,
				});

			// Process exercise templates to extract relevant information
			const templates =
				data?.exercise_templates?.map((template: ExerciseTemplate) =>
					formatExerciseTemplate(template),
				) || [];

			if (templates.length === 0) {
				return createEmptyResponse(
					"No exercise templates found for the specified parameters",
				);
			}

			return createJsonResponse(templates);
		}, "get-exercise-templates"),
	);

	// Get single exercise template by ID
	const getExerciseTemplateSchema = {
		exerciseTemplateId: z.string().min(1),
	} as const;
	type GetExerciseTemplateParams = InferToolParams<
		typeof getExerciseTemplateSchema
	>;

	server.tool(
		"get-exercise-template",
		"Get complete details of a specific exercise template by its ID, including name, category, equipment, muscle groups, and notes.",
		getExerciseTemplateSchema,
		withErrorHandling(async (args: GetExerciseTemplateParams) => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			const { exerciseTemplateId } = args;
			const data: GetV1ExerciseTemplatesExercisetemplateid200 =
				await hevyClient.getExerciseTemplate(exerciseTemplateId);

			if (!data) {
				return createEmptyResponse(
					`Exercise template with ID ${exerciseTemplateId} not found`,
				);
			}

			const template = formatExerciseTemplate(data);
			return createJsonResponse(template);
		}, "get-exercise-template"),
	);

	// Get exercise history for a template
	const getExerciseHistorySchema = {
		exerciseTemplateId: z.string().min(1),
		startDate: z
			.string()
			.datetime({ offset: true })
			.describe("ISO 8601 start date for filtering history")
			.optional(),
		endDate: z
			.string()
			.datetime({ offset: true })
			.describe("ISO 8601 end date for filtering history")
			.optional(),
	} as const;
	type GetExerciseHistoryParams = InferToolParams<
		typeof getExerciseHistorySchema
	>;

	server.tool(
		"get-exercise-history",
		"Get past sets for a specific exercise template, optionally filtered by start and end dates.",
		getExerciseHistorySchema,
		withErrorHandling(async (args: GetExerciseHistoryParams) => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			const { exerciseTemplateId, startDate, endDate } = args;
			const data: GetV1ExerciseHistoryExercisetemplateid200 =
				await hevyClient.getExerciseHistory(exerciseTemplateId, {
					...(startDate ? { start_date: startDate } : {}),
					...(endDate ? { end_date: endDate } : {}),
				});

			const history =
				data?.exercise_history?.map((entry) =>
					formatExerciseHistoryEntry(entry),
				) || [];

			if (history.length === 0) {
				return createEmptyResponse(
					`No exercise history found for template ${exerciseTemplateId}`,
				);
			}

			return createJsonResponse(history);
		}, "get-exercise-history"),
	);

	// Create a custom exercise template
	const createExerciseTemplateSchema = {
		title: z.string().min(1),
		exerciseType: z.enum([
			"weight_reps",
			"reps_only",
			"bodyweight_reps",
			"bodyweight_assisted_reps",
			"duration",
			"weight_duration",
			"distance_duration",
			"short_distance_weight",
		]),
		equipmentCategory: z.enum([
			"none",
			"barbell",
			"dumbbell",
			"kettlebell",
			"machine",
			"plate",
			"resistance_band",
			"suspension",
			"other",
		]),
		muscleGroup: z.enum(MUSCLE_GROUPS),
		otherMuscles: z.array(z.enum(MUSCLE_GROUPS)).default([]),
	} as const;
	type CreateExerciseTemplateParams = InferToolParams<
		typeof createExerciseTemplateSchema
	>;

	server.tool(
		"create-exercise-template",
		"Create a custom exercise template with title, type, equipment, and muscle groups.",
		createExerciseTemplateSchema,
		withErrorHandling(async (args: CreateExerciseTemplateParams) => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			const {
				title,
				exerciseType,
				equipmentCategory,
				muscleGroup,
				otherMuscles,
			} = args;

			const response: PostV1ExerciseTemplates200 =
				await hevyClient.createExerciseTemplate({
					exercise: {
						title,
						exercise_type: exerciseType,
						equipment_category: equipmentCategory,
						muscle_group: muscleGroup,
						other_muscles: otherMuscles,
					},
				});

			return createJsonResponse({
				id: response?.id,
				message: "Exercise template created successfully",
			});
		}, "create-exercise-template"),
	);

	// Search exercise templates (cached)
	const searchExerciseTemplatesSchema = {
		query: z
			.string()
			.min(1)
			.describe(
				"Case-insensitive substring to match against exercise template titles",
			),
		primaryMuscleGroup: z
			.enum(MUSCLE_GROUPS)
			.optional()
			.describe(
				"Optional filter to restrict results to a specific primary muscle group",
			),
		refresh: z
			.boolean()
			.optional()
			.default(false)
			.describe(
				"Set to true to bust the in-memory cache and re-fetch all templates from the API",
			),
	} as const;
	type SearchExerciseTemplatesParams = InferToolParams<
		typeof searchExerciseTemplatesSchema
	>;

	server.tool(
		"search-exercise-templates",
		"Search exercise templates by name with optional muscle group filter. Fetches all templates from the Hevy API on first call and caches them in memory for subsequent searches. Use refresh:true to force a re-fetch.",
		searchExerciseTemplatesSchema,
		withErrorHandling(async (args: SearchExerciseTemplatesParams) => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			const { query, primaryMuscleGroup, refresh } = args;

			// Populate cache if empty or refresh requested.
			// Use an in-flight promise to prevent concurrent duplicate fetches.
			if (exerciseTemplateCache === null || refresh) {
				if (refresh) exerciseTemplateFetch = null;

				if (exerciseTemplateFetch === null) {
					exerciseTemplateFetch = (async () => {
						const allTemplates: ExerciseTemplate[] = [];
						let page = 1;
						let pageCount = 1;

						do {
							const data: GetV1ExerciseTemplates200 =
								await hevyClient.getExerciseTemplates({
									page,
									pageSize: 100,
								});

							const templates = data?.exercise_templates ?? [];
							allTemplates.push(...templates);
							pageCount = data?.page_count ?? 1;
							page++;
						} while (page <= pageCount);

						exerciseTemplateCache = allTemplates;
						exerciseTemplateFetch = null;
						return allTemplates;
					})();
				}

				await exerciseTemplateFetch;
			}

			// Filter by query (case-insensitive title substring match)
			const queryLower = query.toLowerCase();
			let results = exerciseTemplateCache.filter((t) =>
				(t.title ?? "").toLowerCase().includes(queryLower),
			);

			// Optional primary muscle group filter
			if (primaryMuscleGroup !== undefined) {
				results = results.filter(
					(t) => t.primary_muscle_group === primaryMuscleGroup,
				);
			}

			if (results.length === 0) {
				return createEmptyResponse(
					`No exercise templates found matching "${query}"${primaryMuscleGroup ? ` with primary muscle group "${primaryMuscleGroup}"` : ""}`,
				);
			}

			return createJsonResponse(results.map(formatExerciseTemplate));
		}, "search-exercise-templates"),
	);
}
