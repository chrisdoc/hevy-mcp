// Commented out to prevent stdout pollution in stdio mode
// dotenvx prints colored status messages that break JSON-RPC communication
// import "@dotenvx/dotenvx/config";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { name, version } from "../package.json";
import { registerFolderTools } from "./tools/folders.js";
import { registerRoutineTools } from "./tools/routines.js";
import { registerTemplateTools } from "./tools/templates.js";
import { registerWebhookTools } from "./tools/webhooks.js";
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

function buildServer(apiKey: string) {
	const server = new McpServer({
		name,
		version,
	});

	const hevyClient = createClient(apiKey, HEVY_API_BASEURL);
	console.error("Hevy client initialized with API key");

	registerWorkoutTools(server, hevyClient);
	registerRoutineTools(server, hevyClient);
	registerTemplateTools(server, hevyClient);
	registerFolderTools(server, hevyClient);
	registerWebhookTools(server, hevyClient);

	return server;
}

export default function createServer({ config }: { config: ServerConfig }) {
	const { apiKey } = serverConfigSchema.parse(config);
	const server = buildServer(apiKey);
	return server.server;
}

async function runServer() {
	const args = process.argv.slice(2);
	const cfg = parseConfig(args, process.env);
	const apiKey = cfg.apiKey;
	assertApiKey(apiKey);

	const server = buildServer(apiKey);
	// Removed console.log to prevent stdout pollution in stdio mode
	// console.log("Starting MCP server in stdio mode");
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

const isDirectExecution = (() => {
	if (typeof process === "undefined" || !Array.isArray(process.argv)) {
		return false;
	}
	if (typeof import.meta === "undefined" || !import.meta?.url) {
		return false;
	}
	try {
		const modulePath = fileURLToPath(import.meta.url);
		return process.argv[1] === modulePath;
	} catch {
		return false;
	}
})();

if (isDirectExecution) {
	runServer().catch((error) => {
		console.error("Fatal error in main():", error);
		process.exit(1);
	});
}
