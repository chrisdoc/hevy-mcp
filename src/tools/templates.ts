import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
// Import types from generated client
import type { ExerciseTemplate } from "../generated/client/types/index.js";
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
			const data = await hevyClient.getExerciseTemplates({
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
			const data = await hevyClient.getExerciseTemplate(exerciseTemplateId);

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
			const data = await hevyClient.getExerciseHistory(exerciseTemplateId, {
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
		muscleGroup: z.enum([
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
		]),
		otherMuscles: z
			.array(
				z.enum([
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
				]),
			)
			.default([]),
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

			const response = await hevyClient.createExerciseTemplate({
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
}
