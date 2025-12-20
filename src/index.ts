import dotenvx from "@dotenvx/dotenvx";
import * as Sentry from "@sentry/node";

declare const __HEVY_MCP_NAME__: string | undefined;
declare const __HEVY_MCP_VERSION__: string | undefined;

const isBuiltArtifact = import.meta.url.includes("/dist/");
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

// Configure dotenvx with quiet mode to prevent stdout pollution in stdio mode
dotenvx.config({ quiet: true });

// Sentry monitoring is baked into the built MCP server so usage and errors
// from users of the published package are captured for observability.
const sentryRelease = process.env.SENTRY_RELEASE ?? `${name}@${version}`;
const sentryConfig = {
	dsn: "https://ce696d8333b507acbf5203eb877bce0f@o4508975499575296.ingest.de.sentry.io/4509049671647312",
	release: sentryRelease,
	// Tracing must be enabled for MCP monitoring to work
	tracesSampleRate: 1.0,
	sendDefaultPii: false,
} as const;

Sentry.init(sentryConfig);

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
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
	const baseServer = new McpServer({
		name,
		version,
	});
	const server = Sentry.wrapMcpServerWithSentry(baseServer);

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
