import { z } from "zod";
// Import types from generated client
import type {
	GetV1ExerciseHistoryExercisetemplateid200,
	GetV1ExerciseTemplates200,
	GetV1ExerciseTemplatesExercisetemplateid200,
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

import { type InferToolParams } from "../utils/tool-helpers.js";
import {
	exerciseTemplateInputShape,
	nonEmptyId,
	paginationShape,
} from "./input-schemas.js";
import { buildExerciseTemplateRequest } from "./payload-mappers.js";
import { muscleGroupEnum } from "../utils/schemas.js";
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

const isoDateTimeBase = z.iso.datetime({ offset: true });
const isoDateTimeWithOffset = z
	.string()
	.refine(
		(value) => isoDateTimeBase.safeParse(value).success,
		"Must be an ISO 8601 timestamp with an offset",
	)
	.meta({ format: "date-time" });

const getExerciseHistorySchema = {
	exerciseTemplateId: nonEmptyId,
	startDate: isoDateTimeWithOffset.optional(),
	endDate: isoDateTimeWithOffset.optional(),
} as const;

const createExerciseTemplateSchema = exerciseTemplateInputShape;

const searchExerciseTemplatesSchema = {
	query: z.string().min(1),
	primaryMuscleGroup: muscleGroupEnum.optional(),
	refresh: z.boolean().optional().default(false),
} as const;

const getExerciseTemplatesDefinition = {
	name: "get-exercise-templates",
	feature: "templates" as const,
	operation: "list" as const,
	description:
		"Read-only. Pages through exercise templates. Use search-exercise-templates when a title is known.",
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
	description:
		"Read-only. Gets one exercise template by exerciseTemplateId. Use search-exercise-templates to discover IDs.",
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
	description:
		"Read-only. Returns performed sets for one exercise-template ID, optionally bounded by ISO 8601 timestamps.",
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
	description:
		"Writes a custom exercise template. Search first; retries or reused titles can create duplicates.",
	inputSchema: createExerciseTemplateSchema,
	annotations: createAnnotations("Create Exercise Template"),
	kind: "write" as const,
	responseContract: createExerciseTemplateResponse,
	execute: async (
		runtime: ToolRuntime,
		args: InferToolParams<typeof createExerciseTemplateSchema>,
	) => {
		return runtime
			.getClient()
			.createExerciseTemplate(buildExerciseTemplateRequest(args));
	},
};

const searchExerciseTemplatesDefinition = {
	name: "search-exercise-templates",
	feature: "templates" as const,
	operation: "search" as const,
	description:
		"Read-only. Searches template titles case-insensitively and returns IDs. refresh reloads the five-minute catalog cache.",
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
