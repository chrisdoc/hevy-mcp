import { AsyncLocalStorage } from "node:async_hooks";
import { SpanStatusCode, trace, type Span } from "@opentelemetry/api";
import { createSafeErrorDiagnostic, ErrorType } from "@hevy-mcp/core";
import type { NodeTransport } from "./arguments.js";
import {
	getCurrentMcpSessionId,
	getCurrentMcpTransport,
} from "./mcp-session-observability.js";
import { projectExecutionAttributes } from "./execution-telemetry.js";
import { captureFailure, tracer } from "./telemetry.js";

type SdkRequestHandler = (request: unknown, extra: unknown) => Promise<unknown>;

interface SdkProtocolInternals {
	_requestHandlers?: Map<string, SdkRequestHandler>;
}

interface ToolRequestLike {
	params?: { name?: unknown };
}

interface SdkToolErrorHost {
	createToolError?: (message: string) => unknown;
	onerror?: (error: Error) => void;
}

interface ToolResultLike {
	isError?: unknown;
}

type FailureAttributes = Record<string, string | number | boolean>;
type SdkFailureKind = "protocol" | "tool_call" | "validation";
type SdkValidationKind = "input" | "output" | "tool_not_found" | "unknown";

type SdkFailureOptions = {
	expected?: boolean;
	validationKind?: SdkValidationKind;
};

const sdkToolNameStorage = new AsyncLocalStorage<string>();
const sdkRequestStateStorage = new AsyncLocalStorage<{
	expectedValidation?: boolean;
}>();
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
	const attributes: FailureAttributes = {
		"mcp.failure.phase": phase,
		"error.type": errorType,
		"error.category": errorCategory,
		...projectExecutionAttributes(diagnostic),
	};
	if (diagnostic.code) attributes["error.code"] = diagnostic.code;
	if (diagnostic.status !== undefined)
		attributes["http.response.status_code"] = diagnostic.status;
	if (diagnostic.method) attributes["http.request.method"] = diagnostic.method;
	if (diagnostic.endpoint)
		attributes["hevy.api.endpoint"] = diagnostic.endpoint;
	return attributes;
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
	options: SdkFailureOptions = {},
): void {
	const taxonomy = SDK_FAILURE_TAXONOMY[kind];
	const attributes: FailureAttributes = {
		"mcp.tool.name": toolName,
		...createFailureAttributes(
			error,
			"sdk",
			taxonomy.errorType,
			taxonomy.errorCategory,
		),
	};
	if (options.validationKind)
		attributes["mcp.validation.kind"] = options.validationKind;
	span.addEvent("mcp.tool.failure", attributes);
	span.setAttribute("error.type", taxonomy.errorType);
	captureFailure(error, {
		kind: "sdk",
		attributes,
		span,
		expected: options.expected,
	});
	if (options.expected !== true) {
		span.setStatus({ code: SpanStatusCode.ERROR });
	}
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
			captureFailure(error, {
				kind: "protocol",
				attributes,
				span: activeSpan,
			});
		} else {
			tracer.startActiveSpan(
				"mcp.sdk.failure",
				{
					attributes: (() => {
						const spanAttributes: FailureAttributes = {
							"mcp.span.category": "protocol",
							"mcp.transport": transport,
						};
						if (sessionId) spanAttributes["mcp.session.id"] = sessionId;
						return spanAttributes;
					})(),
				},
				(span) => {
					span.addEvent("mcp.tool.failure", {
						"mcp.tool.name": "unknown",
						...attributes,
					});
					captureFailure(error, { kind: "protocol", attributes, span });
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

function classifySdkValidation(message: string): {
	kind: SdkValidationKind;
	expected: boolean;
	toolName?: string;
} {
	const inputValidation =
		/^Input validation error: Invalid arguments for tool ([A-Za-z0-9][A-Za-z0-9._-]{0,63})(?::|$)/u.exec(
			message,
		);
	if (inputValidation) {
		return {
			kind: "input",
			expected: true,
			toolName: inputValidation[1],
		};
	}
	if (message.startsWith("Input validation error:")) {
		return { kind: "input", expected: true };
	}
	if (message.startsWith("Output validation error:")) {
		return { kind: "output", expected: false };
	}
	const missingTool =
		/^Tool ([A-Za-z0-9][A-Za-z0-9._-]{0,63}) not found$/u.exec(message);
	if (missingTool) {
		return {
			kind: "tool_not_found",
			expected: true,
			toolName: missingTool[1],
		};
	}
	return { kind: "unknown", expected: false };
}

function installValidationErrorTracking(server: SdkToolErrorHost): void {
	const toolErrorHost = server;
	const previousCreateToolError = toolErrorHost.createToolError;
	if (!previousCreateToolError) return;
	const createToolError = previousCreateToolError.bind(server);
	toolErrorHost.createToolError = (message) => {
		const validation = classifySdkValidation(message);
		const requestState = sdkRequestStateStorage.getStore();
		if (requestState) requestState.expectedValidation = validation.expected;
		const result = createToolError(message);
		const activeSpan = trace.getActiveSpan();
		if (activeSpan) {
			markSdkToolFailure(
				activeSpan,
				new Error(
					validation.kind === "output"
						? "MCP tool output validation failed"
						: "MCP tool validation failed",
				),
				sdkToolNameStorage.getStore() ?? validation.toolName ?? "unknown",
				"validation",
				{
					expected: validation.expected,
					validationKind: validation.kind,
				},
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
		const attributes: FailureAttributes = {
			"mcp.span.category": "protocol",
			"mcp.transport": transport,
			"mcp.operation.kind": "tool",
			"mcp.tool.name": toolName,
		};
		if (sessionId) attributes["mcp.session.id"] = sessionId;
		enrichActiveSdkSpan(attributes);
		return sdkToolNameStorage.run(toolName, () =>
			sdkRequestStateStorage.run({}, () =>
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
								if (
									sdkRequestStateStorage.getStore()?.expectedValidation !== true
								) {
									span.setStatus({ code: SpanStatusCode.ERROR });
								}
							} else {
								span.setStatus({ code: SpanStatusCode.OK });
							}
							return result;
						} catch (error) {
							const validation =
								error instanceof Error
									? classifySdkValidation(error.message)
									: { kind: "unknown" as const, expected: false };
							if (validation.kind === "tool_not_found") {
								markSdkToolFailure(span, error, toolName, "validation", {
									expected: true,
									validationKind: validation.kind,
								});
							} else {
								markSdkToolFailure(span, error, toolName);
							}
							throw error;
						} finally {
							span.end();
						}
					},
				),
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
				attributes: (() => {
					const attributes: FailureAttributes = {
						"mcp.span.category": "discovery",
						"mcp.transport": getCurrentMcpTransport(),
					};
					if (sessionId) attributes["mcp.session.id"] = sessionId;
					return attributes;
				})(),
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
					captureFailure(error, { kind: "discovery", attributes, span });
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
	if (server.server) installValidationErrorTracking(server.server);
	const handlers = (server.server as SdkProtocolInternals | undefined)
		?._requestHandlers;
	if (!(handlers instanceof Map)) return;
	installInitializeEnrichment(handlers, transport);
	installToolCallTracking(handlers, transport);
	installDiscoveryTracking(handlers);
}
