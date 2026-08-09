import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createToolRuntime } from "./tool-runtime.js";
import { registerHevyTools, hevyToolDefinitions } from "./register.js";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";

type SchemaObject = {
	properties?: object;
	items?: unknown;
};

const EXPECTED_TOOL_NAMES = [
	"get-workouts",
	"get-workout",

	"get-workout-events",
	"create-workout",
	"update-workout",
	"replace-workout-exercises",
	"get-routines",
	"get-routine",
	"create-routine",
	"update-routine",

	"get-exercise-template",
	"get-exercise-history",
	"create-exercise-template",
	"search-exercise-templates",

	"get-routine-folder",
	"create-routine-folder",
	"get-body-measurements",
	"get-body-measurement",
	"create-body-measurement",
	"update-body-measurement",

	"get-training-summary",
	"search-routines",
] as const;

describe("registerHevyTools", () => {
	let client: Client;
	let server: McpServer;

	beforeEach(async () => {
		server = new McpServer({ name: "tool-list-test", version: "1.0.0" });
		const catalog: ExerciseTemplateCatalog = {
			get: () => Promise.resolve([]),
			reset: () => {},
		};
		registerHevyTools(
			server,
			createToolRuntime({
				client: null,
				catalog,
			}),
		);
		client = new Client({ name: "tool-list-client", version: "1.0.0" });

		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await Promise.all([
			server.connect(serverTransport),
			client.connect(clientTransport),
		]);
	});

	afterEach(async () => {
		await Promise.all([client.close(), server.close()]);
	});

	it("advertises the complete production tool set without an API client", async () => {
		const { tools } = await client.listTools();

		expect(tools).toHaveLength(EXPECTED_TOOL_NAMES.length);
		expect(tools.map(({ name }) => name)).toEqual(EXPECTED_TOOL_NAMES);
	});

	it("advertises the non-empty update-workout patch invariant", async () => {
		const { tools } = await client.listTools();
		const updateWorkout = tools.find(({ name }) => name === "update-workout");

		expect(updateWorkout).toBeDefined();
		expect(updateWorkout?.inputSchema).toEqual(
			expect.objectContaining({
				required: expect.arrayContaining(["workout"]),
				properties: expect.objectContaining({
					workout: expect.objectContaining({
						type: "object",
						additionalProperties: false,
						minProperties: 1,
					}),
				}),
			}),
		);
	});

	it("declares bounded feature, kind, and operation metadata for every tool", () => {
		expect(hevyToolDefinitions).toHaveLength(EXPECTED_TOOL_NAMES.length);
		for (const definition of hevyToolDefinitions) {
			expect([
				"workouts",
				"routines",
				"templates",
				"measurements",
				"folders",
				"profile",
				"workflows",
			]).toContain(definition.feature);
			expect(["read", "write"]).toContain(definition.kind);
			expect([
				"list",
				"get",
				"search",
				"create",
				"update",
				"count",
				"sync",
			]).toContain(definition.operation);
		}
	});

	it("advertises output schemas for read tools", async () => {
		const { tools } = await client.listTools();
		const summary = tools.find(({ name }) => name === "get-training-summary");

		expect(summary?.outputSchema).toBeDefined();
	});
	it("exposes only snake_case public input property names", async () => {
		const { tools } = await client.listTools();
		const propertyNames: string[] = [];
		const visit = (schema: unknown): void => {
			if (!schema || typeof schema !== "object") return;
			const record = schema as SchemaObject;
			if (record.properties) {
				for (const [name, child] of Object.entries(record.properties)) {
					propertyNames.push(name);
					visit(child);
				}
			}
			if (record.items) visit(record.items);
		};
		for (const tool of tools) visit(tool.inputSchema);
		expect(
			propertyNames.filter((name) => !/^[a-z][a-z0-9_]*$/u.test(name)),
		).toEqual([]);
	});
});
