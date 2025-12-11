import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import type { ExerciseTemplate } from "../generated/client/types/index.js";
import { formatExerciseTemplate } from "../utils/formatters.js";
import { registerTemplateTools } from "./templates.js";

type HevyClient = ReturnType<
	typeof import("../utils/hevyClientKubb.js").createClient
>;

function createMockServer() {
	const tool = vi.fn();
	const server = { tool } as unknown as McpServer;
	return { server, tool };
}

function getToolRegistration(toolSpy: ReturnType<typeof vi.fn>, name: string) {
	const match = toolSpy.mock.calls.find(([toolName]) => toolName === name);
	if (!match) {
		throw new Error(`Tool ${name} was not registered`);
	}
	const [, , , handler] = match as [
		string,
		string,
		Record<string, unknown>,
		(args: Record<string, unknown>) => Promise<{
			content: Array<{ type: string; text: string }>;
			isError?: boolean;
		}>,
	];
	return { handler };
}

describe("registerTemplateTools", () => {
	it("returns error responses when Hevy client is not initialized", async () => {
		const { server, tool } = createMockServer();
		registerTemplateTools(server, null);

		const toolNames = ["get-exercise-templates", "get-exercise-template"];

		for (const name of toolNames) {
			const { handler } = getToolRegistration(tool, name);
			const response = await handler({});
			expect(response).toMatchObject({
				isError: true,
				content: [
					{
						type: "text",
						text: expect.stringContaining(
							"API client not initialized. Please provide HEVY_API_KEY.",
						),
					},
				],
			});
		}
	});

	it("get-exercise-templates returns formatted templates from the client", async () => {
		const { server, tool } = createMockServer();
		const template: ExerciseTemplate = {
			id: "t1",
			title: "Bench Press",
			type: "barbell",
			primary_muscle_group: "chest",
			secondary_muscle_groups: ["triceps"],
			is_custom: false,
		};
		const hevyClient: HevyClient = {
			getExerciseTemplates: vi
				.fn()
				.mockResolvedValue({ exercise_templates: [template] }),
		} as unknown as HevyClient;

		registerTemplateTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-exercise-templates");

		const response = await handler({ page: 1, pageSize: 5 });

		expect(hevyClient.getExerciseTemplates).toHaveBeenCalledWith({
			page: 1,
			pageSize: 5,
		});

		const parsed = JSON.parse(response.content[0].text) as unknown[];
		expect(parsed).toEqual([formatExerciseTemplate(template)]);
	});

	it("get-exercise-template returns an empty response when template is not found", async () => {
		const { server, tool } = createMockServer();
		const hevyClient: HevyClient = {
			getExerciseTemplate: vi.fn().mockResolvedValue(null),
		} as unknown as HevyClient;

		registerTemplateTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-exercise-template");

		const response = await handler({ exerciseTemplateId: "missing-id" });
		expect(hevyClient.getExerciseTemplate).toHaveBeenCalledWith("missing-id");
		expect(response.content[0]?.text).toBe(
			"Exercise template with ID missing-id not found",
		);
	});
});
