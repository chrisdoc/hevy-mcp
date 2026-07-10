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
import { registerWorkoutPrompts } from "./prompts/workouts.js";
import { registerHevyResources } from "./resources/hevy.js";
import { registerBodyMeasurementTools } from "./tools/body-measurements.js";
import { registerFolderTools } from "./tools/folders.js";
import { registerRoutineTools } from "./tools/routines.js";
import { registerTemplateTools } from "./tools/templates.js";
import { registerUserTools } from "./tools/user.js";
import { registerWorkoutTools } from "./tools/workouts.js";
import { assertApiKey, parseConfig } from "./utils/config.js";
import { installGracefulShutdown } from "./utils/graceful-shutdown.js";
import { createClient } from "./utils/hevyClient.js";
import { createMcpClientLogger } from "./utils/mcp-client-logger.js";
import { createInstrumentedStdioTransport } from "./utils/stdio-observability.js";

const name = serviceName;
const version = serviceVersion;

const SERVER_INSTRUCTIONS = [
	[
		"Hevy MCP connects clients to the authenticated user's Hevy",
		"workout-tracking data, including workouts, routines, exercise templates,",
		"routine folders, body measurements, and profile information.",
		"HEVY_API_KEY must contain a valid Hevy API key.",
	].join(" "),
	[
		"Safety: all get-* and search-* tools are read-only. create-* and",
		"update-* tools mutate Hevy data. Creates are additive and",
		"non-idempotent, so repeating one can create duplicates. Updates can",
		"overwrite existing data. Delete operations are not available.",
	].join(" "),
	[
		"Workflow: search exercise templates first, then use the returned",
		"template IDs when creating workouts or routines. To create a completed",
		"workout from a routine, fetch the routine as a plan, then obtain the",
		"actual completed sets and end time from the user; never invent completion",
		"data. Use the built-in workflow prompts when they match the task.",
	].join(" "),
	[
		"Pagination: start at page 1 and fetch only the pages needed. Most list",
		"tools allow pageSize up to 10; get-exercise-templates allows up to 100.",
	].join(" "),
	[
		"Rate limits and retries: minimize repeated calls. If Hevy returns HTTP",
		"429, follow its retry guidance. Transient read requests retry",
		"automatically, but write requests do not; confirm uncertain write",
		"outcomes before trying again.",
	].join(" "),
].join("\n\n");

const HELP_TEXT = [
	"Usage:",
	"  hevy-mcp [options]",
	"",
	"Options:",
	"  -h, --help                 Show this help message and exit",
	"  -v, --version              Show version and exit",
	"  --confirm-mutations        Require confirmation before mutating Hevy data",
	"  --hevy-api-key=<api-key>   (deprecated, use HEVY_API_KEY env var)",
	"",
	"Environment:",
	"  HEVY_API_KEY=<api-key>     Hevy API key from Hevy app settings",
	"  HEVY_MCP_CONFIRM_MUTATIONS=1",
	"                             Require confirmation before mutating Hevy data",
	"  HEVY_MCP_DEBUG=1           Enable verbose diagnostics on stderr",
	"",
	"Examples:",
	"  HEVY_API_KEY=your-key npx hevy-mcp",
	"  HEVY_API_KEY=your-key npx hevy-mcp --confirm-mutations",
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
	// Trimmed to 10 characters to keep it compact and readable in Sentry & OTel traces.
	return createHmac("sha256", apiKey)
		.update(SENTRY_USER_ID_CONTEXT)
		.digest("hex")
		.slice(0, 10);
}
const serverConfigSchema = z.object({
	apiKey: z
		.string()
		.min(1, "Hevy API key is required")
		.describe("Your Hevy API key (available in the Hevy app settings)."),
	confirmMutations: z
		.boolean()
		.default(false)
		.describe("Require confirmation before mutating Hevy data."),
});

export const configSchema = serverConfigSchema;
type ServerConfig = z.input<typeof serverConfigSchema>;

function createToolCountingServer(server: McpServer) {
	let count = 0;

	const countingServer = new Proxy(server, {
		get(target, property, receiver) {
			if (property === "tool") {
				return (...args: Parameters<McpServer["tool"]>) => {
					const registeredTool = target.tool(...args);
					count += 1;
					return registeredTool;
				};
			}

			if (property === "registerTool") {
				const registerTool: McpServer["registerTool"] = (
					name,
					config,
					callback,
				) => {
					const registeredTool = target.registerTool(name, config, callback);
					count += 1;
					return registeredTool;
				};
				return registerTool;
			}

			return Reflect.get(target, property, receiver);
		},
	});

	return {
		server: countingServer,
		getCount: () => count,
	};
}

function buildServer(apiKey: string, confirmMutations: boolean) {
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

				const baseServer = new McpServer(
					{
						name,
						version,
					},
					{
						capabilities: { logging: {} },
						instructions: SERVER_INSTRUCTIONS,
					},
				);
				const server = Sentry.wrapMcpServerWithSentry(baseServer);
				const clientLogger = createMcpClientLogger(server);

				const hevyClient = tracer.startActiveSpan(
					"mcp.hevy-client.initialize",
					(childSpan) => {
						try {
							return createClient(apiKey, HEVY_API_BASEURL, {
								logger: clientLogger,
							});
						} finally {
							childSpan.end();
						}
					},
				);
				console.error("Hevy client initialized with API key");

				tracer.startActiveSpan("mcp.tools.register", (toolsSpan) => {
					try {
						const counting = createToolCountingServer(server);
						registerWorkoutTools(counting.server, hevyClient, {
							confirmMutations,
						});
						registerRoutineTools(counting.server, hevyClient, {
							confirmMutations,
						});
						registerTemplateTools(counting.server, hevyClient, {
							confirmMutations,
							logger: clientLogger,
						});
						registerFolderTools(counting.server, hevyClient, {
							confirmMutations,
						});
						registerBodyMeasurementTools(counting.server, hevyClient, {
							confirmMutations,
						});
						registerUserTools(counting.server, hevyClient);
						toolsSpan.setAttribute("mcp.tools.count", counting.getCount());
					} finally {
						toolsSpan.end();
					}
				});

				registerWorkoutPrompts(server);
				tracer.startActiveSpan(
					"mcp.resources.register",
					{
						attributes: {
							"mcp.resources.count": 4,
						},
					},
					(resourcesSpan) => {
						try {
							registerHevyResources(server, hevyClient);
						} finally {
							resourcesSpan.end();
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
	const { apiKey, confirmMutations } = serverConfigSchema.parse(config);
	const server = buildServer(apiKey, confirmMutations);
	return server;
}

export default createServer;

export async function runServer() {
	const args = process.argv.slice(2);
	const cliAction = getCliAction(args);

	if (cliAction === "version") {
		console.error(`${name} v${version}`);
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
				const { apiKey, confirmMutations } = cfg;
				assertApiKey(apiKey);

				const server = buildServer(apiKey, confirmMutations);
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
				installGracefulShutdown({ target: server });

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
