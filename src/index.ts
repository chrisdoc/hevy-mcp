#!/usr/bin/env node
import "@dotenvx/dotenvx/config";
// Import tool registration functions
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { name, version } from "../package.json";
import { registerFolderTools } from "./tools/folders.js";
import { registerRoutineTools } from "./tools/routines.js";
import { registerTemplateTools } from "./tools/templates.js";
import { registerWebhookTools } from "./tools/webhooks.js";
import { registerWorkoutTools } from "./tools/workouts.js";
import { assertApiKey, parseConfig } from "./utils/config.js";
import { createClient } from "./utils/hevyClient.js";

const HEVY_API_BASEURL = "https://api.hevyapp.com";

// Parse config (CLI args + env)
const args = process.argv.slice(2);
const cfg = parseConfig(args, process.env);
const apiKey = cfg.apiKey;
assertApiKey(apiKey);

// Create server instance
const server = new McpServer({
	name,
	version,
});

const hevyClient = createClient(apiKey, HEVY_API_BASEURL);
console.log("Hevy client initialized with API key");

// Register all tools (they will use the global client)
registerWorkoutTools(server, hevyClient);
registerRoutineTools(server, hevyClient);
registerTemplateTools(server, hevyClient);
registerFolderTools(server, hevyClient);
registerWebhookTools(server, hevyClient);

// Start the server
async function runServer() {
	console.log("Starting MCP server in stdio mode");
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

runServer().catch((error) => {
	console.error("Fatal error in main():", error);
	process.exit(1);
});
