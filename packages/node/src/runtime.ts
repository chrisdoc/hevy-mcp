// Telemetry is acquired by the scoped Node lifecycle Layer; imports stay
// side-effect-free for embedders.
import { tracer, serviceName, serviceVersion } from "./utils/telemetry.js";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { SpanStatusCode } from "@opentelemetry/api";
import { z } from "zod";
import { createHevyMcpServer, mergeAbortSignals } from "@hevy-mcp/core";
import { createHevyClient, isHevyHttpError } from "@hevy-mcp/hevy-client";
import { assertApiKey, parseConfig } from "./utils/config.js";
import { parseNodeCliOptions, type NodeTransport } from "./utils/arguments.js";
import { startStreamableHttpServer } from "./utils/streamable-http.js";
import {
	createNodeCacheObserver,
	createNodeHevyClientOptions,
} from "./utils/hevy-client-observability.js";
import { createNodeToolObserver } from "./utils/tool-observer.js";
import { createNodeUserHash } from "./utils/user-hash.js";
import { createInstrumentedStdioTransport } from "./utils/stdio-observability.js";
import {
	recordMcpSessionTermination,
	resolveSessionTerminationCategory,
} from "./utils/mcp-session-observability.js";
import { installSdkErrorTracking } from "./utils/sdk-observability.js";
import {
	recordLifecycleFailure,
	runNodeLifecycle,
	type NodeLifecycleHandle,
} from "./utils/node-lifecycle.js";
import { InvalidHevyApiKeyError } from "./utils/startup-errors.js";

const objectSchema = z.object({}).passthrough();
const stringSchema = z.string();
const numberSchema = z.number();

function isObject<T>(value: T): value is T & object {
	return objectSchema.safeParse(value).success;
}
function isString<T>(value: T): value is T & string {
	return stringSchema.safeParse(value).success;
}
function isNumber<T>(value: T): value is T & number {
	return numberSchema.safeParse(value).success;
}
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
	"  HEVY_MCP_TELEMETRY_DIAGNOSTICS=0  Suppress exception details",
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
const validationErrorDetailsSchema = z.object({
	response: z.object({ status: z.number().optional() }).optional(),
	code: z.string().optional(),
});
const validationErrorSchema = z.union([
	z.instanceof(Error),
	z.string(),
	validationErrorDetailsSchema,
]);
type ValidationError = z.infer<typeof validationErrorSchema>;

function getHttpStatus(error: ValidationError): number | undefined {
	if (isHevyHttpError(error)) {
		return error.status;
	}
	if (!error || !isObject(error) || !("response" in error)) {
		return undefined;
	}

	const response = error.response;
	if (!response || !isObject(response) || !("status" in response)) {
		return undefined;
	}

	return isNumber(response.status) &&
		Number.isInteger(response.status) &&
		response.status >= 100 &&
		response.status <= 599
		? response.status
		: undefined;
}

function getSafeValidationDiagnostic(
	error: ValidationError,
): string | undefined {
	const status = getHttpStatus(error);
	if (status !== undefined) {
		return `HTTP ${status}`;
	}

	if (!error || !isObject(error) || !("code" in error)) {
		return undefined;
	}

	const code = error.code;
	return isString(code) && SAFE_NETWORK_ERROR_CODES.has(code)
		? code
		: undefined;
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
	} catch (caughtError) {
		const parsedError = validationErrorSchema.safeParse(caughtError);
		const error: ValidationError = isHevyHttpError(caughtError)
			? caughtError
			: parsedError.success
				? parsedError.data
				: String(caughtError);
		if (signal?.aborted) throw error;
		const status = getHttpStatus(error);
		if (status === 401 || status === 403) {
			throw new InvalidHevyApiKeyError();
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
					onToolsRegistered: (count) =>
						span.setAttribute("mcp.tools.count", count),
					observer: createNodeToolObserver({
						userHash: createNodeUserHash(apiKey),
					}),
					cacheObserver: createNodeCacheObserver(),
				});
				installSdkErrorTracking(server, transport);
				console.error("Hevy client initialized");

				span.setStatus({ code: SpanStatusCode.OK });
				return server;
			} catch (caughtError) {
				const e =
					caughtError instanceof Error ? caughtError : String(caughtError);
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

export async function runStdioServer(): Promise<
	NodeLifecycleHandle | undefined
> {
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

	return runNodeLifecycle({
		transport: "stdio",
		start: async (context) => {
			const { signal } = context;
			const cfg = parseConfig(process.env);
			const apiKey = cfg.apiKey;
			assertApiKey(apiKey);
			const server = await createNodeMcpServer({ apiKey }, "stdio", signal);
			const ownedServer = context.adoptTarget(server);
			console.error("Starting MCP server in stdio mode");
			const transport = createInstrumentedStdioTransport(
				new StdioServerTransport(),
			);
			context.markConnectAttempted();
			try {
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
							context.markConnectSucceeded();
							connectSpan.setStatus({ code: SpanStatusCode.OK });
						} catch (caughtError) {
							const error =
								caughtError instanceof Error
									? caughtError
									: String(caughtError);
							recordLifecycleFailure(
								connectSpan,
								error,
								"connect",
								"connect_failure",
							);
							connectSpan.setStatus({ code: SpanStatusCode.ERROR });
							throw error;
						} finally {
							connectSpan.end();
						}
					},
				);
			} catch (error) {
				await ownedServer.close().catch(() => undefined);
				throw error;
			}
			return {
				target: server,
				onShutdown: (succeeded) =>
					recordMcpSessionTermination(
						resolveSessionTerminationCategory(succeeded),
					),
			};
		},
		onFailure: (reason, outcome) => {
			if (outcome.transport === "stdio") {
				recordMcpSessionTermination(reason);
			}
		},
	});
}

export async function runServer(): Promise<NodeLifecycleHandle | undefined> {
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
		return runStdioServer();
	}

	return runNodeLifecycle({
		transport: "http",
		start: async (context) => {
			const { signal } = context;
			const cfg = parseConfig(process.env);
			assertApiKey(cfg.apiKey);
			await validateApiKey(cfg.apiKey, signal);
			const handle = await startStreamableHttpServer(
				options,
				cfg.apiKey,
				(params) =>
					Promise.resolve(
						buildServer(
							params.apiKey,
							"http",
							mergeAbortSignals(signal, params.lifecycleSignal),
						),
					),
			);
			context.markListening();
			console.error(
				`Starting MCP server in HTTP mode at ${options.host}:${options.port}/mcp`,
			);
			return { target: handle };
		},
		onFailure: (_reason, outcome) => {
			if (outcome.transport === "http") {
				recordMcpSessionTermination(
					outcome.listening ? "unknown" : "startup_failure",
				);
			}
		},
	});
}
