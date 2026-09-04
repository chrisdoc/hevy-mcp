import { Effect } from "effect";
import { z } from "zod";
import type { TemplatesHistoryInput } from "@hevy-mcp/operations";
import type { ToolRuntime } from "./tool-runtime.js";
import {
	createExerciseTemplateResponse,
	exerciseHistoryResponse,
	exerciseTemplateResponse,
	searchExerciseTemplatesResponse,
} from "../utils/response-contracts.js";
import { createSafeErrorDiagnostic } from "../utils/error-policy.js";
import { logCoreError } from "../utils/core-logger.js";
import {
	createAnnotations,
	readOnlyAnnotations,
} from "../utils/tool-annotations.js";
import type { InferToolParams } from "../utils/tool-helpers.js";
import { exerciseTemplateInputFields, nonEmptyId } from "./input-schemas.js";
import { muscleGroupEnum } from "../utils/schemas.js";
import {
	ExerciseTemplateCatalogService,
	HevyOperationsService,
} from "../effect-services.js";
import { operationEffect, requireOperation } from "./operation-helpers.js";

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
const createExerciseTemplateSchema = exerciseTemplateInputFields;
const searchExerciseTemplatesSchema = {
	query: z.string().min(1),
	primary_muscle_group: muscleGroupEnum.optional(),
	refresh: z.boolean().optional().default(false),
} as const;

function createHistoryInput(
	args: InferToolParams<typeof getExerciseHistorySchema>,
): TemplatesHistoryInput {
	let input = { exerciseTemplateId: args.exercise_template_id };
	if (args.start_date !== undefined) {
		input = Object.assign(input, { startDate: args.start_date });
	}
	if (args.end_date !== undefined) {
		input = Object.assign(input, { endDate: args.end_date });
	}
	return input;
}

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
	execute: (
		runtime: ToolRuntime,
		args: InferToolParams<typeof getExerciseTemplateSchema>,
	) =>
		operationEffect(
			requireOperation(
				runtime.service(HevyOperationsService).templates?.get,
				"templates.get",
			),
			{ exerciseTemplateId: args.exercise_template_id },
			runtime.execution,
		).pipe(
			Effect.map(
				({ exerciseTemplate, exerciseTemplateId, expected404Outcome }) => ({
					exercise_template: exerciseTemplate,
					exercise_template_id: exerciseTemplateId,
					expected404Outcome,
				}),
			),
		),
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
	execute: (
		runtime: ToolRuntime,
		args: InferToolParams<typeof getExerciseHistorySchema>,
	) => {
		const input = createHistoryInput(args);
		return operationEffect(
			requireOperation(
				runtime.service(HevyOperationsService).templates?.history,
				"templates.history",
			),
			input,
			runtime.execution,
		).pipe(
			Effect.map(({ exerciseHistory, exerciseTemplateId }) => ({
				exercise_history: exerciseHistory,
				exercise_template_id: exerciseTemplateId,
			})),
		);
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
	execute: (
		runtime: ToolRuntime,
		args: InferToolParams<typeof createExerciseTemplateSchema>,
	) =>
		operationEffect(
			requireOperation(
				runtime.service(HevyOperationsService).templates?.create,
				"templates.create",
			),
			args,
			runtime.execution,
		),
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
	execute: (
		runtime: ToolRuntime,
		args: InferToolParams<typeof searchExerciseTemplatesSchema>,
	) => {
		const catalog = runtime.service(ExerciseTemplateCatalogService);
		const templates = catalog.effect({
			refresh: args.refresh,
			execution: runtime.execution,
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
					logCoreError(
						"Failed to emit structured exercise template cache log",
						createSafeErrorDiagnostic(error),
					);
				}
			},
		});

		return templates.pipe(
			Effect.map((catalogTemplates) => {
				const queryLower = args.query.toLowerCase();
				let results = catalogTemplates.filter((template) =>
					(template.title ?? "").toLowerCase().includes(queryLower),
				);
				if (args.primary_muscle_group !== undefined) {
					results = results.filter(
						(template) =>
							template.primary_muscle_group === args.primary_muscle_group,
					);
				}
				return {
					results,
					query: args.query,
					primary_muscle_group: args.primary_muscle_group,
				};
			}),
		);
	},
};

/** Ordered exercise-template tools for composition by the shared server. */
export const templateToolDefinitions = [
	getExerciseTemplateDefinition,
	getExerciseHistoryDefinition,
	createExerciseTemplateDefinition,
	searchExerciseTemplatesDefinition,
] as const;
