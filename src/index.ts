import * as Sentry from "@sentry/node";
import { createHmac } from "node:crypto";

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

const DEFAULT_SENTRY_DSN =
	"https://ce696d8333b507acbf5203eb877bce0f@o4508975499575296.ingest.de.sentry.io/4509049671647312";
const SENTRY_FALSE_VALUES = new Set(["0", "false", "no", "off"]);

function isSentryEnabled(): boolean {
	const rawValue = process.env.HEVY_MCP_ENABLE_SENTRY;
	if (typeof rawValue !== "string") {
		return true;
	}

	return !SENTRY_FALSE_VALUES.has(rawValue.trim().toLowerCase());
}

function resolveSentryDsn(): string {
	const dsnOverride = process.env.SENTRY_DSN?.trim();
	return dsnOverride && dsnOverride.length > 0
		? dsnOverride
		: DEFAULT_SENTRY_DSN;
}

function initSentryIfEnabled(): boolean {
	if (!isSentryEnabled()) {
		return false;
	}

	Sentry.init({
		dsn: resolveSentryDsn(),
		release: process.env.SENTRY_RELEASE ?? `${name}@${version}`,
		// Tracing must be enabled for MCP monitoring to work
		tracesSampleRate: 1.0,
		sendDefaultPii: false,
	});

	return true;
}

type StartupSpanOptions = Parameters<typeof Sentry.startSpan>[0];

function withStartupSpan<T>(
	sentryEnabled: boolean,
	spanOptions: StartupSpanOptions,
	callback: () => T,
): T {
	if (!sentryEnabled) {
		return callback();
	}

	return Sentry.startSpan(spanOptions, callback);
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { registerBodyMeasurementTools } from "./tools/body-measurements.js";
import { registerFolderTools } from "./tools/folders.js";
import { registerRoutineTools } from "./tools/routines.js";
import { registerTemplateTools } from "./tools/templates.js";
import { registerUserTools } from "./tools/user.js";
import { registerWorkoutTools } from "./tools/workouts.js";
import { assertApiKey, parseConfig } from "./utils/config.js";
import { createClient } from "./utils/hevyClient.js";
import { createInstrumentedStdioTransport } from "./utils/stdio-observability.js";

const HEVY_API_BASEURL = "https://api.hevyapp.com";

const SENTRY_USER_ID_CONTEXT = "hevy-mcp:sentry-user-id:v1";

function fingerprintApiKey(apiKey: string) {
	// HMAC-SHA-256 gives Sentry a deterministic pseudonymous user ID without
	// sending, logging, or storing the raw Hevy API key.
	return createHmac("sha256", apiKey)
		.update(SENTRY_USER_ID_CONTEXT)
		.digest("hex");
}

const serverConfigSchema = z.object({
	apiKey: z
		.string()
		.min(1, "Hevy API key is required")
		.describe("Your Hevy API key (available in the Hevy app settings)."),
});

export const configSchema = serverConfigSchema;
type ServerConfig = z.infer<typeof serverConfigSchema>;

function buildServer(apiKey: string, sentryEnabled: boolean) {
	return withStartupSpan(
		sentryEnabled,
		{
			name: "mcp.server.build",
			op: "mcp.lifecycle.build",
			attributes: {
				"mcp.server.name": name,
				"mcp.server.version": version,
				"mcp.transport": "stdio",
			},
		},
		() => {
			if (sentryEnabled) {
				Sentry.setUser({ id: fingerprintApiKey(apiKey) });
			}

			const baseServer = new McpServer({
				name,
				version,
			});
			const server = sentryEnabled
				? Sentry.wrapMcpServerWithSentry(baseServer)
				: baseServer;

			const hevyClient = withStartupSpan(
				sentryEnabled,
				{
					name: "mcp.hevy-client.initialize",
					op: "mcp.lifecycle.client.init",
				},
				() => createClient(apiKey, HEVY_API_BASEURL),
			);
			console.error("Hevy client initialized with API key");

			withStartupSpan(
				sentryEnabled,
				{
					name: "mcp.tools.register",
					op: "mcp.lifecycle.tools.register",
					attributes: {
						"mcp.tools.count": 6,
					},
				},
				() => {
					registerWorkoutTools(server, hevyClient);
					registerRoutineTools(server, hevyClient);
					registerTemplateTools(server, hevyClient);
					registerFolderTools(server, hevyClient);
					registerBodyMeasurementTools(server, hevyClient);
					registerUserTools(server, hevyClient);
				},
			);

			return server;
		},
	);
}

export function createServer({ config }: { config: ServerConfig }) {
	const { apiKey } = serverConfigSchema.parse(config);
	const sentryEnabled = initSentryIfEnabled();
	const server = buildServer(apiKey, sentryEnabled);
	return server;
}

export default createServer;

export async function runServer() {
	const sentryEnabled = initSentryIfEnabled();

	await withStartupSpan(
		sentryEnabled,
		{
			name: "mcp.server.run",
			op: "mcp.lifecycle.run",
			attributes: {
				"mcp.transport": "stdio",
			},
		},
		async () => {
			const args = process.argv.slice(2);
			const cfg = parseConfig(args, process.env);
			const apiKey = cfg.apiKey;
			assertApiKey(apiKey);

			const server = buildServer(apiKey, sentryEnabled);
			console.error("Starting MCP server in stdio mode");
			const transport = sentryEnabled
				? createInstrumentedStdioTransport(new StdioServerTransport())
				: new StdioServerTransport();

			await withStartupSpan(
				sentryEnabled,
				{
					name: "mcp.server.connect",
					op: "mcp.lifecycle.connect",
					attributes: {
						"mcp.transport": "stdio",
					},
				},
				async () => {
					await server.connect(transport);
				},
			);
		},
	);
}
