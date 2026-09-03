/* oxlint-disable typescript/unbound-method */
import type { JSONObject } from "@modelcontextprotocol/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	createMockHevyClient,
	createMockMcpServer,
} from "../../test-fixtures/mock-hevy.js";
import {
	ExerciseTemplateCatalogService,
	HevyClientService,
} from "../effect-services.js";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";
import { createToolRuntime } from "./tool-runtime.js";
import { registerToolDefinition } from "./define-tool.js";
import { templateToolDefinitions } from "./templates.js";

function register(client: ReturnType<typeof createMockHevyClient> | null) {
	const { server, registerTool: tool } = createMockMcpServer();
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
	return call.at(-1) as (args: JSONObject) => Promise<object>;
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
		const client = createMockHevyClient();
		client.getExerciseTemplate.mockResolvedValue({
			id: "t1",
			title: "Cable Row",
		});
		client.getExerciseHistory.mockResolvedValue({ exercise_history: [] });
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
		const client = createMockHevyClient();
		client.createExerciseTemplate.mockResolvedValue({
			id: "t1",
			...templateInput.exercise,
		});
		const tool = register(client);
		await handler(tool, "create-exercise-template")(templateInput);
		expect(client.createExerciseTemplate).toHaveBeenCalledWith(templateInput);
	});

	it("uses snake_case search filters and rejects camelCase aliases", () => {
		const tool = register(null);
		const registration = tool.mock.calls.find(
			([name]) => name === "search-exercise-templates",
		);
		if (!registration) throw new Error("Tool was not registered");
		const inputSchema = registration[1]?.inputSchema;
		if (!inputSchema) throw new Error("Tool input schema is missing");
		const parsedInputSchema = z.instanceof(z.ZodType).parse(inputSchema);
		expect(
			parsedInputSchema.parse({
				query: "bench",
				primary_muscle_group: "chest",
				refresh: true,
			}),
		).toMatchObject({ primary_muscle_group: "chest" });
		expect(() =>
			parsedInputSchema.parse({
				query: "bench",
				primaryMuscleGroup: "chest",
			}),
		).toThrow();
	});

	it("uses layer client and catalog services when getter facades disagree", async () => {
		const layerClient = createMockHevyClient();
		const getterClient = createMockHevyClient();
		layerClient.getExerciseTemplate.mockResolvedValue({
			id: "layer-template",
			title: "Layer Template",
		});
		getterClient.getExerciseTemplate.mockRejectedValue(
			new Error("wrong client source"),
		);
		const layerCatalog: ExerciseTemplateCatalog = {
			effect: () => Effect.succeed([]),
			get: vi
				.fn()
				.mockResolvedValue([{ id: "layer-template", title: "Layer Template" }]),
			reset: vi.fn(),
		};
		const getterCatalog: ExerciseTemplateCatalog = {
			effect: () => Effect.succeed([]),
			get: vi.fn().mockRejectedValue(new Error("wrong catalog source")),
			reset: vi.fn(),
		};
		const runtime = createToolRuntime({
			client: layerClient,
			catalog: layerCatalog,
		});
		vi.spyOn(runtime, "getClient").mockReturnValue(getterClient);
		Object.assign(runtime, { catalog: getterCatalog });

		await expect(
			templateToolDefinitions[0].execute(runtime, {
				exercise_template_id: "layer-template",
			}),
		).resolves.toEqual({
			exercise_template: {
				id: "layer-template",
				title: "Layer Template",
			},
			exercise_template_id: "layer-template",
		});
		await expect(
			templateToolDefinitions[3].execute(runtime, {
				query: "layer",
				refresh: false,
			}),
		).resolves.toMatchObject({
			results: [{ id: "layer-template", title: "Layer Template" }],
		});

		expect(runtime.service(HevyClientService)).toBe(layerClient);
		expect(runtime.service(ExerciseTemplateCatalogService)).toBe(layerCatalog);
		expect(layerClient.getExerciseTemplate).toHaveBeenCalledWith(
			"layer-template",
		);
		expect(getterClient.getExerciseTemplate).not.toHaveBeenCalled();
		expect(layerCatalog.get).toHaveBeenCalledOnce();
		expect(getterCatalog.get).not.toHaveBeenCalled();
	});
});
