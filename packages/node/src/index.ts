// Telemetry must be initialized before any other imports so that
// OpenTelemetry and Sentry are ready before application code runs.
import {
	Sentry,
	flushTelemetry,
	installProcessExceptionTracking,
	tracer,
	serviceName,
	serviceVersion,
	setTelemetryUser,
} from "./utils/telemetry.js";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { serverStartups } from "./utils/metrics.js";

import { SpanStatusCode } from "@opentelemetry/api";
import { z } from "zod";
import { createHevyMcpServer } from "@hevy-mcp/core";
import { createHevyClient, isHevyHttpError } from "@hevy-mcp/hevy-client";
import { assertApiKey, parseConfig } from "./utils/config.js";
import { parseNodeCliOptions, type NodeTransport } from "./utils/arguments.js";
import { startStreamableHttpServer } from "./utils/streamable-http.js";
import { installGracefulShutdown } from "./utils/graceful-shutdown.js";
import { createNodeHevyClientOptions } from "./utils/hevy-client-observability.js";
import { createNodeToolObserver } from "./utils/tool-observer.js";
import { createInstrumentedStdioTransport } from "./utils/stdio-observability.js";
import {
	recordMcpSessionTermination,
	resolveSessionTerminationCategory,
} from "./utils/mcp-session-observability.js";
import { scheduleUpdateCheck } from "./utils/version-check.js";

const name = serviceName;
const cleanupProcessExceptionTracking = installProcessExceptionTracking();
const version = serviceVersion;

const HELP_TEXT = [
	"Usage:",
	"  hevy-mcp [options]",
	"",
	"Options:",
	"  -h, --help                 Show this help message and exit",
	"  -v, --version              Show version and exit",
	"  --transport stdio|http     Select the transport (default: stdio)",
	"  --host <host>              HTTP bind host (default: 127.0.0.1)",
	"  --port <port>              HTTP bind port (default: 3000)",
	"",
	"Environment:",
	"  HEVY_API_KEY=<api-key>     Hevy API key from Hevy app settings",
	"  HEVY_MCP_DEBUG=1           Enable verbose diagnostics on stderr",
	"  HEVY_MCP_HTTP_BEARER_TOKEN Protect non-loopback HTTP deployments",
	"  HEVY_MCP_TELEMETRY=0     Disable all project telemetry",
	"",
	"Examples:",
	"  HEVY_API_KEY=your-key npx hevy-mcp",
	"  HEVY_API_KEY=your-key npx hevy-mcp --transport http --port 3000",
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
const STARTUP_PROBE_TIMEOUT_MS = 5_000;

const INVALID_API_KEY_MESSAGE =
	"HEVY_API_KEY is invalid or expired. Please check your API key in the Hevy app under Settings > API Key.";
const API_KEY_VALIDATION_WARNING =
	"Warning: HEVY_API_KEY could not be validated during startup. Startup will continue; check your network connection and Hevy API availability.";
const SAFE_NETWORK_ERROR_CODES = new Set([
	"EAI_AGAIN",
	"ECONNABORTED",
	"ECONNREFUSED",
	"ECONNRESET",
	"ENETUNREACH",
	"ENOTFOUND",
	"ERR_NETWORK",
	"ERR_SOCKET_TIMEOUT",
	"ETIMEDOUT",
	"HEVY_RETRY_EXHAUSTED",
]);

const serverConfigSchema = z.object({
	apiKey: z
		.string()
		.min(1, "Hevy API key is required")
		.describe("Your Hevy API key (available in the Hevy app settings)."),
});

function getHttpStatus(error: unknown): number | undefined {
	if (isHevyHttpError(error)) {
		return error.status;
	}
	if (!error || typeof error !== "object" || !("response" in error)) {
		return undefined;
	}

	const response = error.response;
	if (!response || typeof response !== "object" || !("status" in response)) {
		return undefined;
	}

	return typeof response.status === "number" &&
		Number.isInteger(response.status) &&
		response.status >= 100 &&
		response.status <= 599
		? response.status
		: undefined;
}

function getSafeValidationDiagnostic(error: unknown): string | undefined {
	const status = getHttpStatus(error);
	if (status !== undefined) {
		return `HTTP ${status}`;
	}

	if (!error || typeof error !== "object" || !("code" in error)) {
		return undefined;
	}

	const code = error.code;
	return typeof code === "string" && SAFE_NETWORK_ERROR_CODES.has(code)
		? code
		: undefined;
}

async function validateApiKey(apiKey: string) {
	// Keep the startup probe separate from the normal MCP-aware client. The
	// server is not connected yet, so structured client logging is intentionally
	// omitted until the normal client is built below.
	const startupProbeClient = createHevyClient({
		apiKey,
		baseUrl: HEVY_API_BASEURL,
		maxGetRetries: 0,
		timeoutMs: STARTUP_PROBE_TIMEOUT_MS,
	});

	try {
		await startupProbeClient.getUserInfo();
	} catch (error) {
		const status = getHttpStatus(error);
		if (status === 401 || status === 403) {
			throw new Error(INVALID_API_KEY_MESSAGE);
		}

		const diagnostic = getSafeValidationDiagnostic(error);
		console.error(
			diagnostic
				? `${API_KEY_VALIDATION_WARNING} Diagnostic: ${diagnostic}.`
				: API_KEY_VALIDATION_WARNING,
		);
	}
}

function buildServer(apiKey: string, transport: NodeTransport = "stdio") {
	return tracer.startActiveSpan(
		"mcp.server.build",
		{
			attributes: {
				"mcp.server.name": name,
				"mcp.server.version": version,
				"mcp.transport": transport,
			},
		},
		(span) => {
			try {
				const server = createHevyMcpServer({
					createClient: ({ onLog }) =>
						createHevyClient({
							apiKey,
							...createNodeHevyClientOptions(),
							onLog,
						}),
					decorateServer: (baseServer) =>
						Sentry.wrapMcpServerWithSentry(baseServer, {
							recordInputs: false,
							recordOutputs: false,
						}),
					onToolsRegistered: (count) =>
						span.setAttribute("mcp.tools.count", count),
					observer: createNodeToolObserver(),
				});
				console.error("Hevy client initialized with API key");

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

export async function createNodeMcpServer(
	{ apiKey }: { apiKey: string },
	transport: NodeTransport = "stdio",
) {
	const { apiKey: validatedApiKey } = serverConfigSchema.parse({ apiKey });
	setTelemetryUser(validatedApiKey);
	await validateApiKey(validatedApiKey);
	return buildServer(validatedApiKey, transport);
}

export async function runStdioServer() {
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

	// Seed the user context before config validation so startup failures for a
	// supplied key retain the same trace correlation as normal tool calls.
	const configuredApiKey = process.env.HEVY_API_KEY;
	if (configuredApiKey) {
		setTelemetryUser(configuredApiKey);
	}
	let connectAttempted = false;

	await tracer.startActiveSpan(
		"mcp.server.run",
		{
			attributes: {
				"mcp.transport": "stdio",
			},
		},
		async (span) => {
			try {
				const cfg = parseConfig(process.env);
				const apiKey = cfg.apiKey;
				assertApiKey(apiKey);

				const server = await createNodeMcpServer({ apiKey });
				console.error("Starting MCP server in stdio mode");
				const transport = createInstrumentedStdioTransport(
					new StdioServerTransport(),
				);
				connectAttempted = true;

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
				scheduleUpdateCheck({
					packageName: serviceName,
					currentVersion: serviceVersion,
				});
				installGracefulShutdown({
					target: server,
					onComplete: async (succeeded) => {
						recordMcpSessionTermination(
							resolveSessionTerminationCategory(succeeded),
						);
						await flushTelemetry();
						cleanupProcessExceptionTracking();
					},
				});

				span.setStatus({ code: SpanStatusCode.OK });
			} catch (e) {
				recordMcpSessionTermination(
					connectAttempted ? "connect_failure" : "startup_failure",
				);
				span.setStatus({ code: SpanStatusCode.ERROR });
				throw e;
			} finally {
				span.end();
			}
		},
	);
}

export async function runServer(): Promise<void> {
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

	const options = parseNodeCliOptions(args);
	if (options.transport === "stdio") {
		await runStdioServer();
		return;
	}

	await tracer.startActiveSpan(
		"mcp.server.run",
		{ attributes: { "mcp.transport": "http" } },
		async (span) => {
			let listening = false;
			serverStartups.add(1, { version });
			try {
				const cfg = parseConfig(process.env);
				assertApiKey(cfg.apiKey);
				setTelemetryUser(cfg.apiKey);
				await validateApiKey(cfg.apiKey);
				const handle = await startStreamableHttpServer(
					options,
					cfg.apiKey,
					(params) => Promise.resolve(buildServer(params.apiKey, "http")),
				);
				listening = true;
				console.error(
					`Starting MCP server in HTTP mode at ${options.host}:${options.port}/mcp`,
				);
				scheduleUpdateCheck({
					packageName: serviceName,
					currentVersion: serviceVersion,
				});
				installGracefulShutdown({
					target: handle,
					onComplete: async () => {
						cleanupProcessExceptionTracking();
						await flushTelemetry();
					},
				});
				span.setStatus({ code: SpanStatusCode.OK });
			} catch (error) {
				recordMcpSessionTermination(listening ? "unknown" : "startup_failure");
				span.setStatus({ code: SpanStatusCode.ERROR });
				throw error;
			} finally {
				span.end();
			}
		},
	);
}
