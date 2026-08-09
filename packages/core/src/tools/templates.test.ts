/* oxlint-disable typescript/unbound-method */
import type { McpServer } from "@modelcontextprotocol/server";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import { describe, expect, it, vi } from "vitest";
import { createToolRuntime } from "./tool-runtime.js";
import { registerToolDefinition } from "./define-tool.js";
import { templateToolDefinitions } from "./templates.js";

function register(client: HevyClient | null) {
	const tool = vi.fn();
	const server = { tool, registerTool: tool } as unknown as McpServer;
	const runtime = createToolRuntime({ client, catalog: {} as never });
	for (const definition of templateToolDefinitions)
		registerToolDefinition(server, runtime, definition);
	return tool;
}

function handler(tool: { mock: { calls: unknown[][] } }, name: string) {
	const call = tool.mock.calls.find(
		([registeredName]) => registeredName === name,
	);
	if (!call) throw new Error(`Tool ${name} was not registered`);
	return call.at(-1) as (args: object) => Promise<object>;
}

const templateInput = {
	exercise: {
		title: "Cable Row",
		exercise_type: "weight_reps",
		equipment_category: "machine",
		muscle_group: "upper_back",
		other_muscles: [],
	},
};

describe("exercise template tools", () => {
	it("maps pagination, identifiers, and history query fields", async () => {
		const client = {
			getExerciseTemplate: vi
				.fn()
				.mockResolvedValue({ id: "t1", title: "Cable Row" }),
			getExerciseHistory: vi.fn().mockResolvedValue({ exercise_history: [] }),
		} as unknown as HevyClient;
		const tool = register(client);

		await handler(
			tool,
			"get-exercise-template",
		)({ exercise_template_id: "t1" });
		await handler(
			tool,
			"get-exercise-history",
		)({
			exercise_template_id: "t1",
			start_date: "2025-01-01T00:00:00Z",
			end_date: "2025-01-02T00:00:00Z",
		});

		expect(client.getExerciseTemplate).toHaveBeenCalledWith("t1");
		expect(client.getExerciseHistory).toHaveBeenCalledWith("t1", {
			start_date: "2025-01-01T00:00:00Z",
			end_date: "2025-01-02T00:00:00Z",
		});
	});

	it("passes the snake_case exercise envelope unchanged", async () => {
		const client = {
			createExerciseTemplate: vi
				.fn()
				.mockResolvedValue({ id: "t1", ...templateInput.exercise }),
		} as unknown as HevyClient;
		const tool = register(client);
		await handler(tool, "create-exercise-template")(templateInput);
		expect(client.createExerciseTemplate).toHaveBeenCalledWith(templateInput);
	});

	it("uses snake_case search filters and rejects camelCase aliases", () => {
		const tool = register(null);
		const searchSchema = tool.mock.calls.find(
			([name]) => name === "search-exercise-templates",
		)?.[1] as { inputSchema: { parse(value: unknown): unknown } };
		expect(
			searchSchema.inputSchema.parse({
				query: "bench",
				primary_muscle_group: "chest",
				refresh: true,
			}),
		).toMatchObject({ primary_muscle_group: "chest" });
		expect(() =>
			searchSchema.inputSchema.parse({
				query: "bench",
				primaryMuscleGroup: "chest",
			}),
		).toThrow();
	});
});
