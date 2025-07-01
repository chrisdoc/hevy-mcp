import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HevyClient } from "../generated/client/hevyClient.js";
import { formatExerciseTemplate } from "../utils/formatters.js";

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
		"Get a paginated list of exercise templates available on the account. Returns both default and custom exercise templates with details including title, type, primary muscle group, and secondary muscle groups. Supports up to 100 templates per page.",
		{
			page: z.coerce.number().int().gte(1).default(1),
			pageSize: z.coerce.number().int().gte(1).lte(100).default(20),
		},
		async ({ page, pageSize }) => {
			try {
				const data = await hevyClient.exercise_templates.get({
					queryParameters: {
						page,
						pageSize,
					},
				});
				// Process exercise templates to extract relevant information
				const templates =
					data?.exerciseTemplates?.map((template) =>
						formatExerciseTemplate(template),
					) || [];

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(templates, null, 2),
						},
					],
				};
			} catch (error) {
				console.error("Error fetching exercise templates:", error);
				return {
					content: [
						{
							type: "text",
							text: `Error fetching exercise templates: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				};
			}
		},
	);

	// Get single exercise template by ID
	server.tool(
		"get-exercise-template",
		"Get complete details of a specific exercise template by ID. Returns all template information including title, type, primary muscle group, secondary muscle groups, and whether it's a custom exercise.",
		{
			exerciseTemplateId: z.string().min(1),
		},
		async ({ exerciseTemplateId }) => {
			try {
				const data = await hevyClient.exercise_templates
					.byExerciseTemplateId(exerciseTemplateId)
					.get();

				if (!data) {
					return {
						content: [
							{
								type: "text",
								text: `Exercise template with ID ${exerciseTemplateId} not found`,
							},
						],
					};
				}

				const template = formatExerciseTemplate(data);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(template, null, 2),
						},
					],
				};
			} catch (error) {
				console.error(
					`Error fetching exercise template ${exerciseTemplateId}:`,
					error,
				);
				return {
					content: [
						{
							type: "text",
							text: `Error fetching exercise template: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				};
			}
		},
	);
}
