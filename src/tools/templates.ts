import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
// Import types from generated client
import type { ExerciseTemplate } from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { formatExerciseTemplate } from "../utils/formatters.js";
import {
	createEmptyResponse,
	createJsonResponse,
} from "../utils/response-formatter.js";

// Type definitions for the template operations
type HevyClient = ReturnType<
	typeof import("../utils/hevyClientKubb.js").createClient
>;

/**
 * Register all exercise template-related tools with the MCP server
 */
export function registerTemplateTools(
	server: McpServer,
	hevyClient: HevyClient,
) {
	// Get exercise templates
	server.tool(
		"get-exercise-templates",
		"Get a paginated list of exercise templates (default and custom) with details like name, category, equipment, and muscle groups. Useful for browsing or searching available exercises.",
		{
			page: z.coerce.number().int().gte(1).default(1),
			pageSize: z.coerce.number().int().gte(1).lte(100).default(5),
		},
		withErrorHandling(
			async ({ page, pageSize }: { page: number; pageSize: number }) => {
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
			},
			"get-exercise-templates",
		),
	);

	// Get single exercise template by ID
	server.tool(
		"get-exercise-template",
		"Get complete details of a specific exercise template by its ID, including name, category, equipment, muscle groups, and notes.",
		{
			exerciseTemplateId: z.string().min(1),
		},
		withErrorHandling(
			async ({ exerciseTemplateId }: { exerciseTemplateId: string }) => {
				const data = await hevyClient.getExerciseTemplate(exerciseTemplateId);

				if (!data) {
					return createEmptyResponse(
						`Exercise template with ID ${exerciseTemplateId} not found`,
					);
				}

				const template = formatExerciseTemplate(data);
				return createJsonResponse(template);
			},
			"get-exercise-template",
		),
	);
}
