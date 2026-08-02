// Telemetry must be initialized before any other imports so that
// OpenTelemetry and Sentry are ready before application code runs.
import {
	Sentry,
	flushTelemetry,
	installProcessExceptionTracking,
	recordTelemetryException,
	tracer,
	serviceName,
	serviceVersion,
	setTelemetryUser,
} from "./utils/telemetry.js";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { serverStartups } from "./utils/metrics.js";

import { AsyncLocalStorage } from "node:async_hooks";
import { SpanStatusCode, trace, type Span } from "@opentelemetry/api";
import { z } from "zod";
import { createHevyMcpServer, createSafeErrorDiagnostic } from "@hevy-mcp/core";
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
	getCurrentMcpSessionId,
	getCurrentMcpTransport,
	recordMcpSessionTermination,
	resolveSessionTerminationCategory,
} from "./utils/mcp-session-observability.js";
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
function recordLifecycleFailure(
	span: Span,
	error: unknown,
	phase: "config" | "api_key_validation" | "build" | "connect" | "run",
): void {
	const diagnostic = createSafeErrorDiagnostic(error);
	const attributes = {
		"mcp.failure.phase": phase,
		"error.type": diagnostic.category,
		"error.category": diagnostic.category,
		...(diagnostic.code ? { "error.code": diagnostic.code } : {}),
		...(diagnostic.status !== undefined
			? { "http.response.status_code": diagnostic.status }
			: {}),
		...(diagnostic.method ? { "http.request.method": diagnostic.method } : {}),
		...(diagnostic.endpoint
			? { "hevy.api.endpoint": diagnostic.endpoint }
			: {}),
	};
	span.addEvent("mcp.lifecycle.failure", {
		"error.type": diagnostic.category,
		"error.category": diagnostic.category,
		...(diagnostic.code ? { "error.code": diagnostic.code } : {}),
	});
	recordTelemetryException(error, attributes, span);
}
type SdkRequestHandler = (request: unknown, extra: unknown) => Promise<unknown>;

interface SdkProtocolInternals {
	_requestHandlers?: Map<string, SdkRequestHandler>;
}
interface ToolRequestLike {
	params?: { name?: unknown };
}
interface SdkToolErrorHost {
	createToolError?: (message: string) => unknown;
}

interface ToolResultLike {
	isError?: unknown;
}

const sdkToolNameStorage = new AsyncLocalStorage<string>();
const SAFE_TOOL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;

function getSdkToolName(request: unknown): string {
	if (!request || typeof request !== "object") return "unknown";
	const candidate = (request as ToolRequestLike).params?.name;
	return typeof candidate === "string" && SAFE_TOOL_NAME_PATTERN.test(candidate)
		? candidate
		: "unknown";
}

function markSdkToolFailure(
	span: Span,
	error: unknown,
	toolName = sdkToolNameStorage.getStore() ?? "unknown",
	errorTypeOverride?: string,
): void {
	const diagnostic = createSafeErrorDiagnostic(error);
	const errorType = errorTypeOverride ?? diagnostic.category;
	span.addEvent("mcp.tool.failure", {
		"mcp.tool.name": toolName,
		"error.type": errorType,
		"error.category": diagnostic.category,
		...(diagnostic.code ? { "error.code": diagnostic.code } : {}),
		...(diagnostic.status !== undefined
			? { "http.response.status_code": diagnostic.status }
			: {}),
		...(diagnostic.method ? { "http.request.method": diagnostic.method } : {}),
		...(diagnostic.endpoint
			? { "hevy.api.endpoint": diagnostic.endpoint }
			: {}),
	});
	span.setAttribute("error.type", errorType);
	recordTelemetryException(
		error,
		{
			"mcp.failure.phase": "sdk",
			"error.type": errorType,
			"error.category": diagnostic.category,
			...(diagnostic.code ? { "error.code": diagnostic.code } : {}),
			...(diagnostic.status !== undefined
				? { "http.response.status_code": diagnostic.status }
				: {}),
		},
		span,
	);
	span.setStatus({ code: SpanStatusCode.ERROR });
}

function installSdkErrorTracking(server: {
	server?: { onerror?: (error: Error) => void };
}): void {
	const protocol = server.server;
	if (!protocol) return;
	const previous = protocol.onerror;
	protocol.onerror = (error) => {
		const diagnostic = createSafeErrorDiagnostic(error);
		const attributes = {
			"mcp.failure.phase": "sdk",
			"error.category": diagnostic.category,
			...(diagnostic.code ? { "error.code": diagnostic.code } : {}),
			...(diagnostic.status !== undefined
				? { "http.response.status_code": diagnostic.status }
				: {}),
		};
		const activeSpan = trace.getActiveSpan();
		const sessionId = getCurrentMcpSessionId();
		if (activeSpan) {
			activeSpan.addEvent("mcp.tool.failure", {
				"mcp.tool.name": sdkToolNameStorage.getStore() ?? "unknown",
				"error.type": "UNKNOWN_ERROR",
				"error.category": diagnostic.category,
				...(diagnostic.code ? { "error.code": diagnostic.code } : {}),
			});
			recordTelemetryException(error, attributes, activeSpan);
		} else {
			tracer.startActiveSpan(
				"mcp.sdk.failure",
				{
					attributes: {
						...(sessionId ? { "mcp.session.id": sessionId } : {}),
					},
				},
				(span) => {
					span.addEvent("mcp.tool.failure", {
						"mcp.tool.name": "unknown",
						"error.type": "UNKNOWN_ERROR",
						"error.category": diagnostic.category,
						...(diagnostic.code ? { "error.code": diagnostic.code } : {}),
					});
					recordTelemetryException(error, attributes, span);
					span.end();
				},
			);
		}
		try {
			previous?.(error);
		} catch {
			// Existing SDK/Sentry handlers must not affect protocol behavior.
		}
	};
	const toolErrorHost = server as unknown as SdkToolErrorHost;
	const previousCreateToolError = toolErrorHost.createToolError;
	if (previousCreateToolError) {
		const createToolError = previousCreateToolError.bind(server);
		toolErrorHost.createToolError = (message) => {
			const result = createToolError(message);
			const activeSpan = trace.getActiveSpan();
			if (activeSpan) {
				markSdkToolFailure(
					activeSpan,
					new Error("MCP tool validation failed"),
					undefined,
					"VALIDATION_ERROR",
				);
			}
			return result;
		};
	}

	const handlers = (protocol as unknown as SdkProtocolInternals)
		._requestHandlers;
	if (!(handlers instanceof Map)) return;

	const toolHandler = handlers.get("tools/call");
	if (toolHandler) {
		handlers.set("tools/call", (request, extra) => {
			const sessionId = getCurrentMcpSessionId();
			const toolName = getSdkToolName(request);
			return sdkToolNameStorage.run(toolName, () =>
				tracer.startActiveSpan(
					"mcp.sdk.tools.call",
					{
						attributes: {
							"mcp.span.category": "protocol",
							"mcp.operation.kind": "tool",
							"mcp.tool.name": toolName,
							...(sessionId ? { "mcp.session.id": sessionId } : {}),
						},
					},
					async (span) => {
						try {
							const result = (await toolHandler(
								request,
								extra,
							)) as ToolResultLike;
							if (result?.isError === true) {
								span.setAttribute("mcp.tool.outcome", "returned_error");
								span.setStatus({ code: SpanStatusCode.ERROR });
							} else {
								span.setStatus({ code: SpanStatusCode.OK });
							}
							return result;
						} catch (error) {
							markSdkToolFailure(span, error, toolName);
							throw error;
						} finally {
							span.end();
						}
					},
				),
			);
		});
	}

	const discoveryHandler = handlers.get("server/discover");
	if (discoveryHandler) {
		handlers.set("server/discover", (request, extra) => {
			const sessionId = getCurrentMcpSessionId();
			return tracer.startActiveSpan(
				"mcp.server.discover",
				{
					attributes: {
						"mcp.span.category": "discovery",
						"mcp.transport": getCurrentMcpTransport(),
						...(sessionId ? { "mcp.session.id": sessionId } : {}),
					},
				},
				async (span) => {
					try {
						const result = await discoveryHandler(request, extra);
						span.setStatus({ code: SpanStatusCode.OK });
						return result;
					} catch (error) {
						const diagnostic = createSafeErrorDiagnostic(error);
						span.addEvent("mcp.discovery.failure", {
							"error.type": diagnostic.category,
							"error.category": diagnostic.category,
							...(diagnostic.code ? { "error.code": diagnostic.code } : {}),
						});
						recordTelemetryException(
							error,
							{
								"mcp.failure.phase": "discovery",
								"error.type": diagnostic.category,
								"error.category": diagnostic.category,
								...(diagnostic.code ? { "error.code": diagnostic.code } : {}),
							},
							span,
						);
						throw error;
					} finally {
						span.end();
					}
				},
			);
		});
	}
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
				installSdkErrorTracking(server);
				console.error("Hevy client initialized with API key");

				span.setStatus({ code: SpanStatusCode.OK });
				return server;
			} catch (e) {
				recordLifecycleFailure(span, e, "build");
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
	const cleanupProcessExceptionTracking = installProcessExceptionTracking();

	serverStartups.add(1, { version });

	// Seed the user context before config validation so startup failures for a
	// supplied key retain the same trace correlation as normal tool calls.
	const configuredApiKey = process.env.HEVY_API_KEY;
	if (configuredApiKey) {
		setTelemetryUser(configuredApiKey);
	}
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
							recordLifecycleFailure(connectSpan, e, "connect");
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
						cleanupProcessExceptionTracking();
						await flushTelemetry();
					},
				});

				span.setStatus({ code: SpanStatusCode.OK });
			} catch (e) {
				if (!connectAttempted || connectSucceeded) {
					recordLifecycleFailure(span, e, "run");
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
				recordLifecycleFailure(span, error, "run");
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
