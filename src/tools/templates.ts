import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
// Import types from generated client
import type {
	GetV1ExerciseHistoryExercisetemplateid200,
	GetV1ExerciseTemplates200,
	GetV1ExerciseTemplatesExercisetemplateid200,
	PostV1ExerciseTemplates200,
} from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import {
	createExerciseTemplateCatalog,
	type ExerciseTemplateCatalog,
} from "../utils/exercise-template-catalog.js";
import type { McpClientLogger } from "../utils/mcp-client-logger.js";
import type { HevyClient } from "../utils/hevyClient.js";
import { createSafeErrorDiagnostic } from "../utils/safe-error-diagnostic.js";
import {
	createExerciseTemplateResponse,
	exerciseHistoryResponse,
	exerciseTemplateResponse,
	exerciseTemplatesResponse,
	respond,
	searchExerciseTemplatesResponse,
} from "../utils/response-formatter.js";
import {
	createAnnotations,
	describeTool,
	readOnlyAnnotations,
} from "../utils/tool-definition.js";
import { requireClient, type InferToolParams } from "../utils/tool-helpers.js";
import {
	equipmentCategoryEnum,
	exerciseTypeEnum,
	muscleGroupEnum,
} from "../utils/schemas.js";

export interface TemplateToolOptions {
	catalog?: ExerciseTemplateCatalog;
	logger?: McpClientLogger;
	wrapHandler?: typeof withErrorHandling;
}

/**
 * Register all exercise template-related tools with the MCP server
 */
export function registerTemplateTools(
	server: McpServer,
	hevyClient: HevyClient | null,
	options: TemplateToolOptions = {},
) {
	const {
		catalog = createExerciseTemplateCatalog(),
		logger,
		wrapHandler = withErrorHandling,
	} = options;
	// Get exercise templates
	const getExerciseTemplatesSchema = {
		page: z.coerce.number().int().gte(1).default(1),
		pageSize: z.coerce.number().int().gte(1).lte(100).default(5),
	} as const;
	type GetExerciseTemplatesParams = InferToolParams<
		typeof getExerciseTemplatesSchema
	>;

	server.registerTool(
		"get-exercise-templates",
		{
			description: describeTool({
				summary:
					"Read-only. Lists default and custom exercise templates with equipment and muscle metadata.",
				aliases: [
					"browse exercises",
					"list exercise catalog",
					"show movements",
				],
				useCase:
					"Use for page-by-page catalog browsing; use search-exercise-templates for a name lookup across the full catalog.",
				importantNotes:
					"Results are paginated; page starts at 1 and pageSize is limited to 100.",
			}),
			inputSchema: getExerciseTemplatesSchema,
			outputSchema: exerciseTemplatesResponse.outputSchema,
			annotations: readOnlyAnnotations("Get Exercise Templates"),
		},
		wrapHandler(async (args: GetExerciseTemplatesParams) => {
			const client = requireClient(hevyClient);
			const { page, pageSize } = args;
			const data: GetV1ExerciseTemplates200 = await client.getExerciseTemplates(
				{
					page,
					pageSize,
				},
			);

			return respond(exerciseTemplatesResponse, data?.exercise_templates);
		}, "get-exercise-templates"),
	);

	// Get single exercise template by ID
	const getExerciseTemplateSchema = {
		exerciseTemplateId: z.string().min(1),
	} as const;
	type GetExerciseTemplateParams = InferToolParams<
		typeof getExerciseTemplateSchema
	>;

	server.registerTool(
		"get-exercise-template",
		{
			description: describeTool({
				summary:
					"Read-only. Retrieves complete metadata for one exercise template by ID.",
				aliases: [
					"show exercise details",
					"fetch movement",
					"exercise template info",
				],
				useCase:
					"Use after locating an exact template; use search-exercise-templates when only a name is known.",
				importantNotes:
					"Requires an exerciseTemplateId from a template list, search, routine, or workout.",
			}),
			inputSchema: getExerciseTemplateSchema,
			outputSchema: exerciseTemplateResponse.outputSchema,
			annotations: readOnlyAnnotations("Get Exercise Template"),
		},
		wrapHandler(async (args: GetExerciseTemplateParams) => {
			const client = requireClient(hevyClient);
			const { exerciseTemplateId } = args;
			const data: GetV1ExerciseTemplatesExercisetemplateid200 =
				await client.getExerciseTemplate(exerciseTemplateId);

			return respond(exerciseTemplateResponse, {
				exerciseTemplate: data,
				exerciseTemplateId,
			});
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

	server.registerTool(
		"get-exercise-history",
		{
			description: describeTool({
				summary:
					"Read-only. Retrieves past performed sets for one exercise template.",
				aliases: ["exercise progress", "past sets", "movement history"],
				useCase:
					"Use to analyze performance for one movement; use get-workouts for complete sessions.",
				importantNotes:
					"Requires an exerciseTemplateId. Optional startDate and endDate must be ISO 8601 datetimes with an offset.",
			}),
			inputSchema: getExerciseHistorySchema,
			outputSchema: exerciseHistoryResponse.outputSchema,
			annotations: readOnlyAnnotations("Get Exercise History"),
		},
		wrapHandler(async (args: GetExerciseHistoryParams) => {
			const client = requireClient(hevyClient);
			const { exerciseTemplateId, startDate, endDate } = args;
			const data: GetV1ExerciseHistoryExercisetemplateid200 =
				await client.getExerciseHistory(exerciseTemplateId, {
					...(startDate ? { start_date: startDate } : {}),
					...(endDate ? { end_date: endDate } : {}),
				});

			return respond(exerciseHistoryResponse, {
				history: data?.exercise_history,
				exerciseTemplateId,
			});
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
		describeTool({
			summary:
				"Writes to the Hevy account by creating a custom exercise template.",
			aliases: ["add custom exercise", "create movement", "define exercise"],
			useCase:
				"Use only when the needed movement is absent; search-exercise-templates should check existing templates first.",
			importantNotes:
				"Requires title, exercise type, equipment category, and primary muscle group. Retrying or reusing a title can create duplicates.",
		}),
		createExerciseTemplateSchema,
		createAnnotations("Create Exercise Template"),
		wrapHandler(async (args: CreateExerciseTemplateParams) => {
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

			return respond(createExerciseTemplateResponse, response);
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

	server.registerTool(
		"search-exercise-templates",
		{
			description: describeTool({
				summary:
					"Read-only for the Hevy account. Searches the full exercise template catalog by title substring.",
				aliases: ["find exercise", "look up movement", "search exercise IDs"],
				useCase:
					"Use when a name or partial name is known, especially to discover IDs for workouts and routines; use get-exercise-templates for page browsing.",
				importantNotes:
					"Matching is case-insensitive. The catalog is cached locally for 5 minutes; refresh:true re-fetches all pages and changes only local cache state.",
			}),
			inputSchema: searchExerciseTemplatesSchema,
			outputSchema: searchExerciseTemplatesResponse.outputSchema,
			annotations: readOnlyAnnotations("Search Exercise Templates"),
		},
		wrapHandler(async (args: SearchExerciseTemplatesParams) => {
			const client = requireClient(hevyClient);
			const { query, primaryMuscleGroup, refresh } = args;
			const templates = await catalog.get(client, {
				refresh,
				onRefreshed: (refreshedCatalog, reason) => {
					try {
						logger?.({
							level: "info",
							logger: "hevy-cache",
							data: {
								message: "Exercise template catalog refreshed",
								count: refreshedCatalog.length,
								reason,
							},
						});
					} catch (error) {
						console.error(
							"Failed to emit structured exercise template cache log",
							createSafeErrorDiagnostic(error),
						);
					}
				},
			});

			// Filter by query (case-insensitive title substring match)
			const queryLower = query.toLowerCase();
			let results = templates.filter((t) =>
				(t.title ?? "").toLowerCase().includes(queryLower),
			);

			// Optional primary muscle group filter
			if (primaryMuscleGroup !== undefined) {
				results = results.filter(
					(t) => t.primary_muscle_group === primaryMuscleGroup,
				);
			}

			return respond(searchExerciseTemplatesResponse, {
				results,
				query,
				primaryMuscleGroup,
			});
		}, "search-exercise-templates"),
	);
}
