import { z } from "zod";
// Import types from generated client
import type {
	GetV1ExerciseHistoryExercisetemplateid200,
	GetV1ExerciseTemplates200,
	GetV1ExerciseTemplatesExercisetemplateid200,
	PostV1ExerciseTemplates200,
} from "@hevy-mcp/hevy-client/types";
import type { ToolRuntime } from "./tool-runtime.js";
import {
	createExerciseTemplateResponse,
	exerciseHistoryResponse,
	exerciseTemplateResponse,
	exerciseTemplatesResponse,
	searchExerciseTemplatesResponse,
} from "../utils/response-formatter.js";
import { createSafeErrorDiagnostic } from "../utils/safe-error-diagnostic.js";
import {
	createAnnotations,
	readOnlyAnnotations,
} from "../utils/tool-annotations.js";
import { describeTool } from "../utils/tool-descriptions.js";
import { type InferToolParams } from "../utils/tool-helpers.js";
import { nonEmptyId, paginationShape } from "./input-schemas.js";
import {
	equipmentCategoryEnum,
	exerciseTypeEnum,
	muscleGroupEnum,
} from "../utils/schemas.js";
import {
	isExpectedListPageNotFound,
	isExpectedReadNotFound,
} from "../utils/hevy-error-policy.js";

const getExerciseTemplatesSchema = paginationShape({
	defaultPageSize: 5,
	maxPageSize: 100,
});

const getExerciseTemplateSchema = {
	exerciseTemplateId: nonEmptyId,
} as const;

const getExerciseHistorySchema = {
	exerciseTemplateId: nonEmptyId,
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

const createExerciseTemplateSchema = {
	title: z.string().min(1),
	exerciseType: exerciseTypeEnum,
	equipmentCategory: equipmentCategoryEnum,
	muscleGroup: muscleGroupEnum,
	otherMuscles: z.array(muscleGroupEnum).default([]),
} as const;

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

const getExerciseTemplatesDefinition = {
	name: "get-exercise-templates",
	feature: "templates" as const,
	operation: "list" as const,
	description: describeTool({
		summary:
			"Read-only. Lists default and custom exercise templates with equipment and muscle metadata.",
		aliases: ["browse exercises", "list exercise catalog", "show movements"],
		useCase:
			"Use for page-by-page catalog browsing; use search-exercise-templates for a name lookup across the full catalog.",
		importantNotes:
			"Results are paginated; page starts at 1 and pageSize is limited to 100.",
	}),
	inputSchema: getExerciseTemplatesSchema,
	outputSchema: exerciseTemplatesResponse.outputSchema,
	annotations: readOnlyAnnotations("Get Exercise Templates"),
	kind: "read" as const,
	responseContract: exerciseTemplatesResponse,
	execute: async (
		runtime: ToolRuntime,
		args: InferToolParams<typeof getExerciseTemplatesSchema>,
	) => {
		const { page, pageSize } = args;
		try {
			const data: GetV1ExerciseTemplates200 = await runtime
				.getClient()
				.getExerciseTemplates({ page, pageSize });
			return {
				items: data?.exercise_templates ?? [],
				page,
				pageCount: data?.page_count,
			};
		} catch (error) {
			if (isExpectedListPageNotFound(error, page)) {
				return { items: [], page, expected404Outcome: "end_of_list" };
			}
			throw error;
		}
	},
};

const getExerciseTemplateDefinition = {
	name: "get-exercise-template",
	feature: "templates" as const,
	operation: "get" as const,
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
	kind: "read" as const,
	responseContract: exerciseTemplateResponse,
	execute: async (
		runtime: ToolRuntime,
		args: InferToolParams<typeof getExerciseTemplateSchema>,
	) => {
		const { exerciseTemplateId } = args;
		try {
			const data: GetV1ExerciseTemplatesExercisetemplateid200 = await runtime
				.getClient()
				.getExerciseTemplate(exerciseTemplateId);
			return { exerciseTemplate: data, exerciseTemplateId };
		} catch (error) {
			if (isExpectedReadNotFound(error)) {
				return {
					exerciseTemplate: null,
					exerciseTemplateId,
					expected404Outcome: "not_found",
				};
			}
			throw error;
		}
	},
};

const getExerciseHistoryDefinition = {
	name: "get-exercise-history",
	feature: "templates" as const,
	operation: "get" as const,
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
	kind: "read" as const,
	responseContract: exerciseHistoryResponse,
	execute: async (
		runtime: ToolRuntime,
		args: InferToolParams<typeof getExerciseHistorySchema>,
	) => {
		const { exerciseTemplateId, startDate, endDate } = args;
		const data: GetV1ExerciseHistoryExercisetemplateid200 = await runtime
			.getClient()
			.getExerciseHistory(exerciseTemplateId, {
				...(startDate ? { start_date: startDate } : {}),
				...(endDate ? { end_date: endDate } : {}),
			});
		return {
			history: data?.exercise_history,
			exerciseTemplateId,
		};
	},
};

const createExerciseTemplateDefinition = {
	name: "create-exercise-template",
	feature: "templates" as const,
	operation: "create" as const,
	description: describeTool({
		summary:
			"Writes to the Hevy account by creating a custom exercise template.",
		aliases: ["add custom exercise", "create movement", "define exercise"],
		useCase:
			"Use only when the needed movement is absent; search-exercise-templates should check existing templates first.",
		importantNotes:
			"Requires title, exercise type, equipment category, and primary muscle group. Retrying or reusing a title can create duplicates.",
	}),
	inputSchema: createExerciseTemplateSchema,
	annotations: createAnnotations("Create Exercise Template"),
	kind: "write" as const,
	responseContract: createExerciseTemplateResponse,
	execute: async (
		runtime: ToolRuntime,
		args: InferToolParams<typeof createExerciseTemplateSchema>,
	) => {
		const {
			title,
			exerciseType,
			equipmentCategory,
			muscleGroup,
			otherMuscles,
		} = args;
		const response: PostV1ExerciseTemplates200 = await runtime
			.getClient()
			.createExerciseTemplate({
				exercise: {
					title,
					exercise_type: exerciseType,
					equipment_category: equipmentCategory,
					muscle_group: muscleGroup,
					other_muscles: otherMuscles,
				},
			});
		return response;
	},
};

const searchExerciseTemplatesDefinition = {
	name: "search-exercise-templates",
	feature: "templates" as const,
	operation: "search" as const,
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
	kind: "read" as const,
	responseContract: searchExerciseTemplatesResponse,
	execute: async (
		runtime: ToolRuntime,
		args: InferToolParams<typeof searchExerciseTemplatesSchema>,
	) => {
		const _client = runtime.getClient();
		const { query, primaryMuscleGroup, refresh } = args;
		const templates = await runtime.catalog.get({
			refresh,
			onRefreshed: (refreshedCatalog, reason) => {
				try {
					runtime.logger?.({
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

		const queryLower = query.toLowerCase();
		let results = templates.filter((t) =>
			(t.title ?? "").toLowerCase().includes(queryLower),
		);
		if (primaryMuscleGroup !== undefined) {
			results = results.filter(
				(t) => t.primary_muscle_group === primaryMuscleGroup,
			);
		}

		return {
			results,
			query,
			primaryMuscleGroup,
		};
	},
};

/** Ordered exercise-template tools for composition by the shared server. */
export const templateToolDefinitions = [
	getExerciseTemplatesDefinition,
	getExerciseTemplateDefinition,
	getExerciseHistoryDefinition,
	createExerciseTemplateDefinition,
	searchExerciseTemplatesDefinition,
] as const;
