declare const __HEVY_MCP_NAME__: string | undefined;
declare const __HEVY_MCP_VERSION__: string | undefined;
declare const __HEVY_MCP_BUILD__: boolean | undefined;

const isBuiltArtifact =
	typeof __HEVY_MCP_BUILD__ === "boolean" ? __HEVY_MCP_BUILD__ : false;
if (
	isBuiltArtifact &&
	(typeof __HEVY_MCP_NAME__ !== "string" ||
		typeof __HEVY_MCP_VERSION__ !== "string")
) {
	throw new Error(
		"Build-time variables __HEVY_MCP_NAME__ and __HEVY_MCP_VERSION__ must be defined.",
	);
}

const name =
	typeof __HEVY_MCP_NAME__ === "string" ? __HEVY_MCP_NAME__ : "hevy-mcp";
const version =
	typeof __HEVY_MCP_VERSION__ === "string" ? __HEVY_MCP_VERSION__ : "dev";

// Environment variables are loaded via Node.js native --env-file flag (Node.js 20.6+)
// or set directly in the environment. No dotenv dependency needed.
// This avoids stdout pollution that corrupts MCP JSON-RPC communication in stdio mode.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { registerFolderTools } from "./tools/folders.js";
import { registerMeasurementTools } from "./tools/measurements.js";
import { registerRoutineTools } from "./tools/routines.js";
import { registerTemplateTools } from "./tools/templates.js";
import { registerUserTools } from "./tools/user.js";
import { registerWorkoutTools } from "./tools/workouts.js";
import { assertApiKey, parseConfig } from "./utils/config.js";
import { createClient } from "./utils/hevyClient.js";

const HEVY_API_BASEURL = "https://api.hevyapp.com";

const serverConfigSchema = z.object({
	apiKey: z
		.string()
		.min(1, "Hevy API key is required")
		.describe("Your Hevy API key (available in the Hevy app settings)."),
});

export const configSchema = serverConfigSchema;
type ServerConfig = z.infer<typeof serverConfigSchema>;

const description =
	"An MCP server implementation that interfaces with the Hevy fitness tracking app and its API.";

// Sent to clients during initialization; most clients add this to the model's
// context, unlike the implementation description.
const instructions =
	"The Hevy API always uses kg for weights, meters for distance, and cm for body measurements. Call get-user-info to learn the user's preferred weight and distance units, and convert values to and from those units when talking to the user.";

function buildServer(apiKey: string) {
	const server = new McpServer(
		{
			name,
			version,
			description,
		},
		{ instructions },
	);

	const hevyClient = createClient(apiKey, HEVY_API_BASEURL);
	console.error("Hevy client initialized with API key");

	registerWorkoutTools(server, hevyClient);
	registerRoutineTools(server, hevyClient);
	registerTemplateTools(server, hevyClient);
	registerFolderTools(server, hevyClient);
	registerMeasurementTools(server, hevyClient);
	registerUserTools(server, hevyClient);

	return server;
}

export default function createServer({ config }: { config: ServerConfig }) {
	const { apiKey } = serverConfigSchema.parse(config);
	const server = buildServer(apiKey);
	return server;
}

export async function runServer() {
	const args = process.argv.slice(2);
	const cfg = parseConfig(args, process.env);
	const apiKey = cfg.apiKey;
	assertApiKey(apiKey);

	const server = buildServer(apiKey);
	console.error("Starting MCP server in stdio mode");
	const transport = new StdioServerTransport();
	await server.connect(transport);
}
