import { AsyncLocalStorage } from "node:async_hooks";
import { SpanStatusCode, trace, type Span } from "@opentelemetry/api";
import { createSafeErrorDiagnostic, ErrorType } from "@hevy-mcp/core";
import type { NodeTransport } from "./arguments.js";
import {
	getCurrentMcpSessionId,
	getCurrentMcpTransport,
} from "./mcp-session-observability.js";
import { recordTelemetryException, tracer } from "./telemetry.js";

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

type FailureAttributes = Record<string, string | number | boolean>;
type SdkFailureKind = "protocol" | "tool_call" | "validation";

const sdkToolNameStorage = new AsyncLocalStorage<string>();
const SAFE_TOOL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const SDK_FAILURE_TAXONOMY: Record<
	SdkFailureKind,
	{ errorType: ErrorType; errorCategory: string }
> = {
	protocol: {
		errorType: ErrorType.UNKNOWN_ERROR,
		errorCategory: "McpSdkProtocolFailure",
	},
	tool_call: {
		errorType: ErrorType.UNKNOWN_ERROR,
		errorCategory: "McpSdkToolCallFailure",
	},
	validation: {
		errorType: ErrorType.VALIDATION_ERROR,
		errorCategory: "McpSdkValidationFailure",
	},
};

function createFailureAttributes(
	error: unknown,
	phase: "discovery" | "sdk",
	errorType: string,
	errorCategory: string,
): FailureAttributes {
	const diagnostic = createSafeErrorDiagnostic(error);
	return {
		"mcp.failure.phase": phase,
		"error.type": errorType,
		"error.category": errorCategory,
		...(diagnostic.code ? { "error.code": diagnostic.code } : {}),
		...(diagnostic.status !== undefined
			? { "http.response.status_code": diagnostic.status }
			: {}),
		...(diagnostic.method ? { "http.request.method": diagnostic.method } : {}),
		...(diagnostic.endpoint
			? { "hevy.api.endpoint": diagnostic.endpoint }
			: {}),
	};
}

function enrichActiveSdkSpan(attributes: FailureAttributes): void {
	try {
		trace.getActiveSpan()?.setAttributes(attributes);
	} catch {
		// SDK span enrichment is best-effort and cannot affect protocol handling.
	}
}

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
	kind: SdkFailureKind = "tool_call",
): void {
	const taxonomy = SDK_FAILURE_TAXONOMY[kind];
	const attributes = createFailureAttributes(
		error,
		"sdk",
		taxonomy.errorType,
		taxonomy.errorCategory,
	);
	span.addEvent("mcp.tool.failure", {
		"mcp.tool.name": toolName,
		...attributes,
	});
	span.setAttribute("error.type", taxonomy.errorType);
	recordTelemetryException(error, attributes, span);
	span.setStatus({ code: SpanStatusCode.ERROR });
}

function installProtocolErrorTracking(
	server: { server?: { onerror?: (error: Error) => void } },
	transport: NodeTransport,
): void {
	const protocol = server.server;
	if (!protocol) return;
	const previous = protocol.onerror;
	protocol.onerror = (error) => {
		const taxonomy = SDK_FAILURE_TAXONOMY.protocol;
		const attributes = createFailureAttributes(
			error,
			"sdk",
			taxonomy.errorType,
			taxonomy.errorCategory,
		);
		const activeSpan = trace.getActiveSpan();
		const sessionId = getCurrentMcpSessionId();
		if (activeSpan) {
			activeSpan.addEvent("mcp.tool.failure", {
				"mcp.tool.name": sdkToolNameStorage.getStore() ?? "unknown",
				...attributes,
			});
			recordTelemetryException(error, attributes, activeSpan);
		} else {
			tracer.startActiveSpan(
				"mcp.sdk.failure",
				{
					attributes: {
						"mcp.span.category": "protocol",
						"mcp.transport": transport,
						...(sessionId ? { "mcp.session.id": sessionId } : {}),
					},
				},
				(span) => {
					span.addEvent("mcp.tool.failure", {
						"mcp.tool.name": "unknown",
						...attributes,
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
}

function installValidationErrorTracking(server: object): void {
	const toolErrorHost = server as SdkToolErrorHost;
	const previousCreateToolError = toolErrorHost.createToolError;
	if (!previousCreateToolError) return;
	const createToolError = previousCreateToolError.bind(server);
	toolErrorHost.createToolError = (message) => {
		const result = createToolError(message);
		const activeSpan = trace.getActiveSpan();
		if (activeSpan) {
			markSdkToolFailure(
				activeSpan,
				new Error("MCP tool validation failed"),
				undefined,
				"validation",
			);
		}
		return result;
	};
}

function installInitializeEnrichment(
	handlers: Map<string, SdkRequestHandler>,
	transport: NodeTransport,
): void {
	const initializeHandler = handlers.get("initialize");
	if (!initializeHandler) return;
	handlers.set("initialize", (request, extra) => {
		enrichActiveSdkSpan({
			"mcp.span.category": "protocol",
			"mcp.transport": transport,
		});
		return initializeHandler(request, extra);
	});
}

function installToolCallTracking(
	handlers: Map<string, SdkRequestHandler>,
	transport: NodeTransport,
): void {
	const toolHandler = handlers.get("tools/call");
	if (!toolHandler) return;
	handlers.set("tools/call", (request, extra) => {
		const sessionId = getCurrentMcpSessionId();
		const toolName = getSdkToolName(request);
		const attributes = {
			"mcp.span.category": "protocol",
			"mcp.transport": transport,
			"mcp.operation.kind": "tool",
			"mcp.tool.name": toolName,
			...(sessionId ? { "mcp.session.id": sessionId } : {}),
		};
		enrichActiveSdkSpan(attributes);
		return sdkToolNameStorage.run(toolName, () =>
			tracer.startActiveSpan(
				"mcp.sdk.tools.call",
				{ attributes },
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

function installDiscoveryTracking(
	handlers: Map<string, SdkRequestHandler>,
): void {
	const discoveryHandler = handlers.get("server/discover");
	if (!discoveryHandler) return;
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
					const attributes = createFailureAttributes(
						error,
						"discovery",
						ErrorType.UNKNOWN_ERROR,
						"McpServerDiscoveryFailure",
					);
					span.addEvent("mcp.discovery.failure", attributes);
					recordTelemetryException(error, attributes, span);
					throw error;
				} finally {
					span.end();
				}
			},
		);
	});
}

export function installSdkErrorTracking(
	server: { server?: { onerror?: (error: Error) => void } },
	transport: NodeTransport,
): void {
	installProtocolErrorTracking(server, transport);
	installValidationErrorTracking(server);
	const handlers = (server.server as SdkProtocolInternals | undefined)
		?._requestHandlers;
	if (!(handlers instanceof Map)) return;
	installInitializeEnrichment(handlers, transport);
	installToolCallTracking(handlers, transport);
	installDiscoveryTracking(handlers);
}
