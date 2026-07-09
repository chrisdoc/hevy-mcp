// Telemetry must be initialized before any other imports so that
// OpenTelemetry and Sentry are ready before application code runs.
import {
	Sentry,
	tracer,
	serviceName,
	serviceVersion,
	setCurrentUserId,
} from "./utils/telemetry.js";
import { serverStartups } from "./utils/metrics.js";

import { SpanStatusCode } from "@opentelemetry/api";
import { createHmac } from "node:crypto";
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

const name = serviceName;
const version = serviceVersion;

const HELP_TEXT = [
	"Usage:",
	"  hevy-mcp [options]",
	"",
	"Options:",
	"  -h, --help                 Show this help message and exit",
	"  -v, --version              Show version and exit",
	"  --hevy-api-key=<api-key>   (deprecated, use HEVY_API_KEY env var)",
	"",
	"Environment:",
	"  HEVY_API_KEY=<api-key>     Hevy API key from Hevy app settings",
	"",
	"Examples:",
	"  HEVY_API_KEY=your-key npx hevy-mcp",
	"  npx hevy-mcp --hevy-api-key=your-key",
	"  npm start -- --hevy-api-key=your-key",
].join("\n");

function getCliAction(args: string[]): "start" | "version" | "help" {
	for (const arg of args) {
		if (arg === "--version" || arg === "-v") {
			return "version";
		}

		if (arg === "--help" || arg === "-h") {
			return "help";
		}
	}

	return "start";
}

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

function buildServer(apiKey: string) {
	const userId = fingerprintApiKey(apiKey);

	return tracer.startActiveSpan(
		"mcp.server.build",
		{
			attributes: {
				"mcp.server.name": name,
				"mcp.server.version": version,
				"mcp.transport": "stdio",
				"user.id": userId,
			},
		},
		(span) => {
			try {
				Sentry.setUser({ id: userId });
				setCurrentUserId(userId);

				const baseServer = new McpServer({
					name,
					version,
				});
				const server = Sentry.wrapMcpServerWithSentry(baseServer);

				const hevyClient = tracer.startActiveSpan(
					"mcp.hevy-client.initialize",
					(childSpan) => {
						try {
							return createClient(apiKey, HEVY_API_BASEURL);
						} finally {
							childSpan.end();
						}
					},
				);
				console.error("Hevy client initialized with API key");

				tracer.startActiveSpan(
					"mcp.tools.register",
					{
						attributes: {
							"mcp.tools.count": 6,
						},
					},
					(toolsSpan) => {
						try {
							registerWorkoutTools(server, hevyClient);
							registerRoutineTools(server, hevyClient);
							registerTemplateTools(server, hevyClient);
							registerFolderTools(server, hevyClient);
							registerBodyMeasurementTools(server, hevyClient);
							registerUserTools(server, hevyClient);
						} finally {
							toolsSpan.end();
						}
					},
				);

				span.setStatus({ code: SpanStatusCode.OK });
				return server;
			} catch (e) {
				span.setStatus({ code: SpanStatusCode.ERROR });
				throw e;
			} finally {
				span.end();
			}
		},
	);
}

export function createServer({ config }: { config: ServerConfig }) {
	const { apiKey } = serverConfigSchema.parse(config);
	const server = buildServer(apiKey);
	return server;
}

export default createServer;

export async function runServer() {
	const args = process.argv.slice(2);
	const cliAction = getCliAction(args);

	if (cliAction === "version") {
		console.log(version);
		return;
	}

	if (cliAction === "help") {
		console.log(HELP_TEXT);
		return;
	}

	serverStartups.add(1, { version });

	await tracer.startActiveSpan(
		"mcp.server.run",
		{
			attributes: {
				"mcp.transport": "stdio",
			},
		},
		async (span) => {
			try {
				const cfg = parseConfig(args, process.env);
				const apiKey = cfg.apiKey;
				assertApiKey(apiKey);

				const server = buildServer(apiKey);
				console.error("Starting MCP server in stdio mode");
				const transport = createInstrumentedStdioTransport(
					new StdioServerTransport(),
				);

				await tracer.startActiveSpan(
					"mcp.server.connect",
					{
						attributes: {
							"mcp.transport": "stdio",
						},
					},
					async (connectSpan) => {
						try {
							await server.connect(transport);
							connectSpan.setStatus({ code: SpanStatusCode.OK });
						} catch (e) {
							connectSpan.setStatus({ code: SpanStatusCode.ERROR });
							throw e;
						} finally {
							connectSpan.end();
						}
					},
				);

				span.setStatus({ code: SpanStatusCode.OK });
			} catch (e) {
				span.setStatus({ code: SpanStatusCode.ERROR });
				throw e;
			} finally {
				span.end();
			}
		},
	);
}
