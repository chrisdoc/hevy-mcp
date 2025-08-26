#!/usr/bin/env node
import "@dotenvx/dotenvx/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { name, version } from "../package.json";
import { registerFolderTools } from "./tools/folders.js";
import { registerRoutineTools } from "./tools/routines.js";
import { registerTemplateTools } from "./tools/templates.js";
import { registerWebhookTools } from "./tools/webhooks.js";
// Import tool registration functions
import { registerWorkoutTools } from "./tools/workouts.js";
import { createClient } from "./utils/hevyClient.js";
import { createHttpServer } from "./utils/httpServer.js";

const HEVY_API_BASEURL = "https://api.hevyapp.com";

// Parse command line arguments
const args = process.argv.slice(2);
const transportMode =
	args.includes("--http") || process.env.MCP_TRANSPORT === "http"
		? "http"
		: "stdio";
const httpPort = Number.parseInt(process.env.MCP_HTTP_PORT || "3000", 10);
const httpHost = process.env.MCP_HTTP_HOST || "127.0.0.1";
const enableDnsRebindingProtection =
	process.env.MCP_DNS_REBINDING_PROTECTION === "true";
const allowedHosts = process.env.MCP_ALLOWED_HOSTS?.split(",") || ["127.0.0.1"];

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
registerWebhookTools(server, hevyClient);

// Start the server
async function runServer() {
	if (transportMode === "http") {
		console.log(`Starting MCP server in HTTP mode on ${httpHost}:${httpPort}`);
		const httpServer = createHttpServer(server, {
			port: httpPort,
			host: httpHost,
			enableDnsRebindingProtection,
			allowedHosts,
		});
		await httpServer.startServer();
	} else {
		console.log("Starting MCP server in stdio mode");
		const transport = new StdioServerTransport();
		await server.connect(transport);
	}
}

runServer().catch((error) => {
	console.error("Fatal error in main():", error);
	process.exit(1);
});
