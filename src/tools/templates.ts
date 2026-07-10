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
import { AsyncTtlCache } from "../utils/cache.js";
import { withObservability } from "../utils/observability-wrapper.js";
import {
	formatExerciseHistoryEntry,
	formatExerciseTemplate,
} from "../utils/formatters.js";
import {
	createEmptyResponse,
	createJsonResponse,
} from "../utils/response-formatter.js";
import {
	createAnnotations,
	readOnlyAnnotations,
} from "../utils/tool-annotations.js";
import { requireClient, type InferToolParams } from "../utils/tool-helpers.js";
import {
	equipmentCategoryEnum,
	exerciseTypeEnum,
	muscleGroupEnum,
} from "../utils/schemas.js";

// Type definitions for the template operations
type HevyClient = ReturnType<
	typeof import("../utils/hevyClientKubb.js").createClient
>;

const EXERCISE_TEMPLATE_CATALOG_CACHE_KEY = "exercise-template-catalog";
const EXERCISE_TEMPLATE_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
const EXERCISE_TEMPLATE_CATALOG_CACHE_MAX_SIZE = 1;

const exerciseTemplateCatalogCache = new AsyncTtlCache<
	string,
	ExerciseTemplate[]
>({
	ttlMs: EXERCISE_TEMPLATE_CATALOG_CACHE_TTL_MS,
	maxSize: EXERCISE_TEMPLATE_CATALOG_CACHE_MAX_SIZE,
});

async function fetchExerciseTemplateCatalog(
	hevyClient: HevyClient,
): Promise<ExerciseTemplate[]> {
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

	return allTemplates;
}

/** Reset the exercise template cache (exposed for testing). */
export function resetExerciseTemplateCache(): void {
	exerciseTemplateCatalogCache.clear();
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
		readOnlyAnnotations("Get Exercise Templates"),
		withObservability(async (args: GetExerciseTemplatesParams) => {
			const client = requireClient(hevyClient);
			const { page, pageSize } = args;
			const data: GetV1ExerciseTemplates200 = await client.getExerciseTemplates(
				{
					page,
					pageSize,
				},
			);

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
		readOnlyAnnotations("Get Exercise Template"),
		withObservability(async (args: GetExerciseTemplateParams) => {
			const client = requireClient(hevyClient);
			const { exerciseTemplateId } = args;
			const data: GetV1ExerciseTemplatesExercisetemplateid200 =
				await client.getExerciseTemplate(exerciseTemplateId);

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
		readOnlyAnnotations("Get Exercise History"),
		withObservability(async (args: GetExerciseHistoryParams) => {
			const client = requireClient(hevyClient);
			const { exerciseTemplateId, startDate, endDate } = args;
			const data: GetV1ExerciseHistoryExercisetemplateid200 =
				await client.getExerciseHistory(exerciseTemplateId, {
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
		exerciseType: exerciseTypeEnum,
		equipmentCategory: equipmentCategoryEnum,
		muscleGroup: muscleGroupEnum,
		otherMuscles: z.array(muscleGroupEnum).default([]),
	} as const;
	type CreateExerciseTemplateParams = InferToolParams<
		typeof createExerciseTemplateSchema
	>;

	server.tool(
		"create-exercise-template",
		"Create a custom exercise template with title, type, equipment, and muscle groups.",
		createExerciseTemplateSchema,
		createAnnotations("Create Exercise Template"),
		withObservability(async (args: CreateExerciseTemplateParams) => {
			const client = requireClient(hevyClient);
			const {
				title,
				exerciseType,
				equipmentCategory,
				muscleGroup,
				otherMuscles,
			} = args;

			const response: PostV1ExerciseTemplates200 =
				await client.createExerciseTemplate({
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
		primaryMuscleGroup: muscleGroupEnum
			.optional()
			.describe(
				"Optional filter to restrict results to a specific primary muscle group",
			),
		refresh: z
			.boolean()
			.optional()
			.default(false)
			.describe(
				"Set to true to invalidate the catalog cache and re-fetch all templates from the API",
			),
	} as const;
	type SearchExerciseTemplatesParams = InferToolParams<
		typeof searchExerciseTemplatesSchema
	>;

	server.tool(
		"search-exercise-templates",
		"Search exercise templates by name with optional muscle group filter. Fetches all templates from the Hevy API on first call, caches the catalog in memory with a bounded TTL cache, and reuses it for subsequent searches. Use refresh:true to force a re-fetch.",
		searchExerciseTemplatesSchema,
		readOnlyAnnotations("Search Exercise Templates"),
		withObservability(async (args: SearchExerciseTemplatesParams) => {
			const client = requireClient(hevyClient);
			const { query, primaryMuscleGroup, refresh } = args;
			const catalog = await exerciseTemplateCatalogCache.getOrFetch(
				EXERCISE_TEMPLATE_CATALOG_CACHE_KEY,
				() => fetchExerciseTemplateCatalog(client),
				{ refresh },
			);

			// Filter by query (case-insensitive title substring match)
			const queryLower = query.toLowerCase();
			let results = catalog.filter((t) =>
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
