import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createToolRuntime } from "./tool-runtime.js";
import { registerToolDefinition } from "./define-tool.js";
import { registerHevyTools } from "./register.js";
import { workflowToolDefinitions } from "./workflows.js";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";

const EXPECTED_TOOL_NAMES = [
	"get-workouts",
	"get-workout",
	"get-workout-count",
	"get-workout-events",
	"create-workout",
	"update-workout",
	"get-routines",
	"get-routine",
	"create-routine",
	"update-routine",
	"get-exercise-templates",
	"get-exercise-template",
	"get-exercise-history",
	"create-exercise-template",
	"search-exercise-templates",
	"get-routine-folders",
	"get-routine-folder",
	"create-routine-folder",
	"get-body-measurements",
	"get-body-measurement",
	"create-body-measurement",
	"update-body-measurement",
	"get-user-info",
	"get-training-summary",
	"search-routines",
] as const;

describe("registerHevyTools", () => {
	let client: Client;
	let server: McpServer;

	beforeEach(async () => {
		server = new McpServer({ name: "tool-list-test", version: "1.0.0" });
		registerHevyTools(
			server,
			createToolRuntime({
				client: null,
				catalog: {} as ExerciseTemplateCatalog,
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

	it("rejects read definitions without an output schema", () => {
		const definition = {
			...workflowToolDefinitions[0],
			outputSchema: undefined,
		};

		expect(() =>
			registerToolDefinition(
				server,
				createToolRuntime({
					client: null,
					catalog: {} as ExerciseTemplateCatalog,
				}),
				definition,
			),
		).toThrow("Read tool get-training-summary requires outputSchema");
	});
});
