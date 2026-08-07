import { z } from "zod";
// Import types from generated client
import type {
	GetV1ExerciseHistoryExercisetemplateid200,
	GetV1ExerciseTemplatesExercisetemplateid200,
} from "@hevy-mcp/hevy-client/types";
import type { ToolRuntime } from "./tool-runtime.js";
import {
	createExerciseTemplateResponse,
	exerciseHistoryResponse,
	exerciseTemplateResponse,
	searchExerciseTemplatesResponse,
} from "../utils/response-contracts.js";
import { createSafeErrorDiagnostic } from "../utils/safe-error-diagnostic.js";
import {
	createAnnotations,
	readOnlyAnnotations,
} from "../utils/tool-annotations.js";

import { type InferToolParams } from "../utils/tool-helpers.js";
import { exerciseTemplateInputShape, nonEmptyId } from "./input-schemas.js";
import { muscleGroupEnum } from "../utils/schemas.js";
import { isExpectedReadNotFound } from "../utils/hevy-error-policy.js";

const getExerciseTemplateSchema = {
	exercise_template_id: nonEmptyId,
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
	exercise_template_id: nonEmptyId,
	start_date: isoDateTimeWithOffset.optional(),
	end_date: isoDateTimeWithOffset.optional(),
} as const;
const createExerciseTemplateSchema = exerciseTemplateInputShape;
const searchExerciseTemplatesSchema = {
	query: z.string().min(1),
	primary_muscle_group: muscleGroupEnum.optional(),
	refresh: z.boolean().optional().default(false),
} as const;

const getExerciseTemplateDefinition = {
	name: "get-exercise-template",
	feature: "templates" as const,
	operation: "get" as const,
	description:
		"Read-only. Gets one exercise template by exercise_template_id. Use search-exercise-templates to discover IDs.",
	inputSchema: getExerciseTemplateSchema,
	outputSchema: exerciseTemplateResponse.outputSchema,
	annotations: readOnlyAnnotations("Get Exercise Template"),
	kind: "read" as const,
	responseContract: exerciseTemplateResponse,
	execute: async (
		runtime: ToolRuntime,
		args: InferToolParams<typeof getExerciseTemplateSchema>,
	) => {
		const { exercise_template_id } = args;
		try {
			const data: GetV1ExerciseTemplatesExercisetemplateid200 = await runtime
				.getClient()
				.getExerciseTemplate(exercise_template_id);
			return { exercise_template: data, exercise_template_id };
		} catch (error) {
			if (isExpectedReadNotFound(error)) {
				return {
					exercise_template: null,
					exercise_template_id,
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
		const { exercise_template_id, start_date, end_date } = args;
		const data: GetV1ExerciseHistoryExercisetemplateid200 = await runtime
			.getClient()
			.getExerciseHistory(exercise_template_id, {
				...(start_date ? { start_date } : {}),
				...(end_date ? { end_date } : {}),
			});
		return {
			exercise_history: data?.exercise_history,
			exercise_template_id,
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
		return runtime.getClient().createExerciseTemplate(args);
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
		const { query, primary_muscle_group, refresh } = args;
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
		if (primary_muscle_group !== undefined) {
			results = results.filter(
				(t) => t.primary_muscle_group === primary_muscle_group,
			);
		}

		return {
			results,
			query,
			primary_muscle_group,
		};
	},
};

/** Ordered exercise-template tools for composition by the shared server. */
export const templateToolDefinitions = [
	getExerciseTemplateDefinition,
	getExerciseHistoryDefinition,
	createExerciseTemplateDefinition,
	searchExerciseTemplatesDefinition,
] as const;
