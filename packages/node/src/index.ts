// Telemetry must be initialized before any other imports so that
// OpenTelemetry and Sentry are ready before application code runs.
import {
	Sentry,
	flushTelemetry,
	installProcessExceptionTracking,
	recordTelemetryException,
	recordSentryTelemetryException,
	tracer,
	serviceName,
	serviceVersion,
} from "./utils/telemetry.js";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { serverStartups } from "./utils/metrics.js";

import { SpanStatusCode, type Span } from "@opentelemetry/api";
import { z } from "zod";
import { createHevyMcpServer, mergeAbortSignals } from "@hevy-mcp/core";
import { createHevyClient, isHevyHttpError } from "@hevy-mcp/hevy-client";
import { assertApiKey, parseConfig } from "./utils/config.js";
import { parseNodeCliOptions, type NodeTransport } from "./utils/arguments.js";
import { startStreamableHttpServer } from "./utils/streamable-http.js";
import { installGracefulShutdown } from "./utils/graceful-shutdown.js";
import {
	createNodeCacheObserver,
	createNodeHevyClientOptions,
} from "./utils/hevy-client-observability.js";
import { createNodeToolObserver } from "./utils/tool-observer.js";
import { createInstrumentedStdioTransport } from "./utils/stdio-observability.js";
import {
	recordMcpSessionTermination,
	resolveSessionTerminationCategory,
} from "./utils/mcp-session-observability.js";
import { installSdkErrorTracking } from "./utils/sdk-observability.js";
import { scheduleUpdateCheck } from "./utils/version-check.js";

const name = serviceName;
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
type LifecycleFailurePhase =
	| "config"
	| "api_key_validation"
	| "build"
	| "connect"
	| "run";

type LifecycleTerminationReason =
	| "startup_failure"
	| "connect_failure"
	| "runtime_failure";

const LIFECYCLE_FAILURE_TAXONOMY: Record<
	LifecycleFailurePhase,
	{ errorType: string; errorCategory: string }
> = {
	config: {
		errorType: "MCP_SERVER_CONFIG_ERROR",
		errorCategory: "McpServerConfigFailure",
	},
	api_key_validation: {
		errorType: "MCP_API_KEY_VALIDATION_ERROR",
		errorCategory: "McpApiKeyValidationFailure",
	},
	build: {
		errorType: "MCP_SERVER_BUILD_ERROR",
		errorCategory: "McpServerBuildFailure",
	},
	connect: {
		errorType: "MCP_TRANSPORT_CONNECT_ERROR",
		errorCategory: "McpTransportConnectFailure",
	},
	run: {
		errorType: "MCP_SERVER_RUN_ERROR",
		errorCategory: "McpServerRunFailure",
	},
};

function createLifecycleFailureAttributes(
	phase: LifecycleFailurePhase,
	terminationReason: LifecycleTerminationReason,
): Record<string, string | number | boolean> {
	const taxonomy = LIFECYCLE_FAILURE_TAXONOMY[phase];
	return {
		"mcp.failure.phase": phase,
		"mcp.termination.reason": terminationReason,
		"error.type": taxonomy.errorType,
		"error.category": taxonomy.errorCategory,
	};
}

function recordLifecycleFailure(
	span: Span,
	error: unknown,
	phase: LifecycleFailurePhase,
	terminationReason: LifecycleTerminationReason,
): void {
	const attributes = createLifecycleFailureAttributes(phase, terminationReason);
	span.addEvent("mcp.lifecycle.failure", attributes);
	recordTelemetryException(error, attributes, span);
	recordSentryTelemetryException("MCP lifecycle failure", error, attributes);
}
async function validateApiKey(apiKey: string, signal?: AbortSignal) {
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
		await startupProbeClient.getUserInfo({
			signal,
			deadline: Date.now() + STARTUP_PROBE_TIMEOUT_MS,
		});
	} catch (error) {
		if (signal?.aborted) throw error;
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

function buildServer(
	apiKey: string,
	transport: NodeTransport = "stdio",
	lifecycleSignal?: AbortSignal,
) {
	return tracer.startActiveSpan(
		"mcp.server.build",
		{
			attributes: {
				"mcp.span.category": "startup",
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
					lifecycleSignal,
					decorateServer: (baseServer) =>
						Sentry.wrapMcpServerWithSentry(baseServer, {
							recordInputs: false,
							recordOutputs: false,
						}),
					onToolsRegistered: (count) =>
						span.setAttribute("mcp.tools.count", count),
					observer: createNodeToolObserver(),
					cacheObserver: createNodeCacheObserver(),
				});
				installSdkErrorTracking(server, transport);
				console.error("Hevy client initialized with API key");

				span.setStatus({ code: SpanStatusCode.OK });
				return server;
			} catch (e) {
				recordLifecycleFailure(span, e, "build", "startup_failure");
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
	lifecycleSignal?: AbortSignal,
) {
	const { apiKey: validatedApiKey } = serverConfigSchema.parse({ apiKey });
	await validateApiKey(validatedApiKey, lifecycleSignal);
	return buildServer(validatedApiKey, transport, lifecycleSignal);
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
	const cleanupProcessExceptionTracking = installProcessExceptionTracking();
	const lifecycleController = new AbortController();

	serverStartups.add(1, { version });

	let connectAttempted = false;
	let connectSucceeded = false;
	await tracer.startActiveSpan(
		"mcp.server.run",
		{
			attributes: {
				"mcp.span.category": "startup",
				"mcp.transport": "stdio",
			},
		},
		async (span) => {
			try {
				const cfg = parseConfig(process.env);
				const apiKey = cfg.apiKey;
				assertApiKey(apiKey);

				const server = await createNodeMcpServer(
					{ apiKey },
					"stdio",
					lifecycleController.signal,
				);
				console.error("Starting MCP server in stdio mode");
				const transport = createInstrumentedStdioTransport(
					new StdioServerTransport(),
				);
				connectAttempted = true;

				await tracer.startActiveSpan(
					"mcp.server.connect",
					{
						attributes: {
							"mcp.span.category": "session",
							"mcp.transport": "stdio",
						},
					},
					async (connectSpan) => {
						try {
							await server.connect(transport);
							connectSucceeded = true;
							connectSpan.setStatus({ code: SpanStatusCode.OK });
						} catch (e) {
							recordLifecycleFailure(
								connectSpan,
								e,
								"connect",
								"connect_failure",
							);
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
					cancel: lifecycleController,
					onComplete: async (succeeded) => {
						recordMcpSessionTermination(
							resolveSessionTerminationCategory(succeeded),
						);
						cleanupProcessExceptionTracking();
						await flushTelemetry();
					},
				});

				span.setStatus({ code: SpanStatusCode.OK });
			} catch (e) {
				if (!connectAttempted || connectSucceeded) {
					recordLifecycleFailure(
						span,
						e,
						"run",
						connectSucceeded ? "runtime_failure" : "startup_failure",
					);
				}
				recordMcpSessionTermination(
					connectAttempted ? "connect_failure" : "startup_failure",
				);
				span.setStatus({ code: SpanStatusCode.ERROR });
				cleanupProcessExceptionTracking();
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
	const cleanupProcessExceptionTracking = installProcessExceptionTracking();
	const lifecycleController = new AbortController();

	await tracer.startActiveSpan(
		"mcp.server.run",
		{
			attributes: {
				"mcp.span.category": "startup",
				"mcp.transport": "http",
			},
		},
		async (span) => {
			let listening = false;
			serverStartups.add(1, { version });
			try {
				const cfg = parseConfig(process.env);
				assertApiKey(cfg.apiKey);
				await validateApiKey(cfg.apiKey, lifecycleController.signal);
				const handle = await startStreamableHttpServer(
					options,
					cfg.apiKey,
					(params) =>
						Promise.resolve(
							buildServer(
								params.apiKey,
								"http",
								mergeAbortSignals(
									lifecycleController.signal,
									params.lifecycleSignal,
								),
							),
						),
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
					cancel: lifecycleController,
					onComplete: async () => {
						cleanupProcessExceptionTracking();
						await flushTelemetry();
					},
				});
				span.setStatus({ code: SpanStatusCode.OK });
			} catch (error) {
				recordLifecycleFailure(
					span,
					error,
					"run",
					listening ? "runtime_failure" : "startup_failure",
				);
				recordMcpSessionTermination(listening ? "unknown" : "startup_failure");
				span.setStatus({ code: SpanStatusCode.ERROR });
				cleanupProcessExceptionTracking();
				throw error;
			} finally {
				span.end();
			}
		},
	);
}
