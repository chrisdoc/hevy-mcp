#!/usr/bin/env node
import "@dotenvx/dotenvx/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { name, version } from "../package.json";
import { registerFolderTools } from "./tools/folders.js";
import { registerRoutineTools } from "./tools/routines.js";
import { registerTemplateTools } from "./tools/templates.js";
// Import tool registration functions
import { registerWorkoutTools } from "./tools/workouts.js";
import { createClient } from "./utils/hevyClient.js";

const HEVY_API_BASEURL = "https://api.hevyapp.com";

// Create server instance
const server = new McpServer({
	name,
	version,
});

// Check for API key
if (!process.env.HEVY_API_KEY) {
	console.error("HEVY_API_KEY environment variable is not set");
	process.exit(1);
}

// Configure client
// We've already checked for HEVY_API_KEY existence above, so it's safe to use here
const apiKey = process.env.HEVY_API_KEY || "";
const hevyClient = createClient(apiKey, HEVY_API_BASEURL);
// Register all tools
registerWorkoutTools(server, hevyClient);
registerRoutineTools(server, hevyClient);
registerTemplateTools(server, hevyClient);
registerFolderTools(server, hevyClient);

// Start the server
async function runServer() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

runServer().catch((error) => {
	console.error("Fatal error in main():", error);
	process.exit(1);
});
