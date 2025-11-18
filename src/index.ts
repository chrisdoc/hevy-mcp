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
import type { HevyClient } from "./utils/hevyClient.js";
import { createClient } from "./utils/hevyClient.js";
import { createHttpServer } from "./utils/httpServer.js";

const HEVY_API_BASEURL = "https://api.hevyapp.com";

// Parse config (CLI args + env)
const args = process.argv.slice(2);
const cfg = parseConfig(args, process.env);

// Create server instance
const server = new McpServer({
	name,
	version,
});

// Global client holder - will be initialized on first request or at startup
let hevyClient: HevyClient | null = null;

// Initialize client with API key
function initializeClient(apiKey: string) {
	if (!hevyClient) {
		assertApiKey(apiKey);
		hevyClient = createClient(apiKey, HEVY_API_BASEURL);
		console.log("Hevy client initialized with API key");
	}
}

// For HTTP mode, we might get API key from query params on first request
// For stdio mode, we need API key from env/args at startup
if (cfg.transportMode === "stdio") {
	// Stdio mode requires API key upfront
	initializeClient(cfg.apiKey!);
} else if (cfg.apiKey) {
	// HTTP mode with env var - initialize now
	initializeClient(cfg.apiKey);
} else {
	// HTTP mode without env var - will wait for query param
	console.log(
		"Starting in HTTP mode without API key. Waiting for API key via query parameter on first request.",
	);
}

// Register all tools (they will use the global client)
// Note: The client might not be initialized yet in HTTP mode without env var
registerWorkoutTools(server, hevyClient);
registerRoutineTools(server, hevyClient);
registerTemplateTools(server, hevyClient);
registerFolderTools(server, hevyClient);
registerWebhookTools(server, hevyClient);

// Start the server
async function runServer() {
	if (cfg.transportMode === "http") {
		console.log(
			`Starting MCP server in HTTP mode on ${cfg.httpHost}:${cfg.httpPort}`,
		);
		const httpServer = createHttpServer(server, {
			port: cfg.httpPort,
			host: cfg.httpHost,
			enableDnsRebindingProtection: cfg.enableDnsRebindingProtection,
			allowedHosts: cfg.allowedHosts,
			// Callback to handle API key from query params
			onFirstRequestApiKey: (apiKey: string) => {
				if (!hevyClient) {
					initializeClient(apiKey);
					// Re-register tools with the newly created client
					registerWorkoutTools(server, hevyClient!);
					registerRoutineTools(server, hevyClient!);
					registerTemplateTools(server, hevyClient!);
					registerFolderTools(server, hevyClient!);
					registerWebhookTools(server, hevyClient!);
				}
			},
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
