import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import nock from "nock";
import { registerWorkoutPrompts } from "../../src/prompts/workouts.js";
import { registerHevyResources } from "../../src/resources/hevy.js";
import { registerBodyMeasurementTools } from "../../src/tools/body-measurements.js";
import { registerFolderTools } from "../../src/tools/folders.js";
import { registerRoutineTools } from "../../src/tools/routines.js";
import { registerTemplateTools } from "../../src/tools/templates.js";
import { registerUserTools } from "../../src/tools/user.js";
import { registerWorkoutTools } from "../../src/tools/workouts.js";
import { resetExerciseTemplateCatalogCache } from "../../src/utils/exercise-template-catalog.js";
import { createClient } from "../../src/utils/hevyClient.js";

export const PERFORMANCE_API_BASEURL = "https://api.hevyapp.com";
export const PERFORMANCE_API_KEY = "performance-fixture-api-key";

export function getPerformanceApiScope() {
	return nock(PERFORMANCE_API_BASEURL, {
		reqheaders: {
			"api-key": PERFORMANCE_API_KEY,
		},
	});
}

export async function createPerformanceHarness() {
	resetExerciseTemplateCatalogCache();
	const server = new McpServer({
		name: "hevy-mcp-performance",
		version: "1.0.0",
	});
	const hevyClient = createClient(PERFORMANCE_API_KEY, PERFORMANCE_API_BASEURL);

	registerWorkoutTools(server, hevyClient);
	registerRoutineTools(server, hevyClient);
	registerTemplateTools(server, hevyClient);
	registerFolderTools(server, hevyClient);
	registerUserTools(server, hevyClient);
	registerBodyMeasurementTools(server, hevyClient);
	registerWorkoutPrompts(server);
	registerHevyResources(server, hevyClient);

	const client = new Client({
		name: "hevy-mcp-performance-client",
		version: "1.0.0",
	});
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await Promise.all([
		client.connect(clientTransport),
		server.connect(serverTransport),
	]);

	return {
		client,
		async close() {
			await client.close();
			await server.close();
		},
	};
}

export async function callPerformanceTool(
	client: Client,
	name: string,
	arguments_: Record<string, unknown>,
) {
	const result = await client.request(
		{
			method: "tools/call",
			params: { name, arguments: arguments_ },
		},
		CallToolResultSchema,
	);
	const firstContent = result.content[0];
	if (!firstContent || firstContent.type !== "text") {
		throw new Error(`${name} did not return text content`);
	}
	if (result.isError) {
		throw new Error(`${name} returned an MCP error: ${firstContent.text}`);
	}

	return {
		text: firstContent.text,
		structuredContent: result.structuredContent,
	};
}

export function assertPerformanceMocksComplete() {
	if (!nock.isDone()) {
		throw new Error(
			`Unused performance fixtures: ${nock.pendingMocks().join(", ")}`,
		);
	}
}
