import { SpanStatusCode, type Span } from "@opentelemetry/api";
import type {
	SafeToolCompletion,
	SafeToolInvocation,
	ToolObservationScope,
	ToolObserver,
} from "@hevy-mcp/core";
import { createExecutionProjection } from "@hevy-mcp/core";
import {
	toolDuration,
	toolErrors,
	toolInvocations,
	toolOutcomes,
} from "./metrics.js";
import {
	getCurrentMcpClientMetadata,
	getCurrentMcpSessionId,
	getCurrentMcpTransport,
	recordMcpToolFailure,
	recordMcpToolInvocation,
} from "./mcp-session-observability.js";
import type { McpClientMetricAttributes } from "./mcp-session-observability.js";
import { projectExecutionAttributes } from "./execution-telemetry.js";
import { captureFailure, tracer } from "./telemetry.js";

type AttributeValue = string | number | boolean;
const DISCOVERY_TOOL_NAMES = new Set(["search-routines"]);

const WORKFLOW_PAGINATION_RESOURCES = new Set([
	"workouts",
	"bodyMeasurements",
	"routines",
]);

function taxonomyAttributes(
	invocation: SafeToolInvocation,
): Record<string, string> {
	const taxonomy = invocation.taxonomy;
	return taxonomy
		? {
				"hevy.feature": taxonomy.feature,
				"mcp.tool.kind": taxonomy.kind,
				"mcp.tool.operation": taxonomy.operation,
			}
		: {};
}

function metricAttributes(
	invocation: SafeToolInvocation,
	clientAttributes: McpClientMetricAttributes,
): Record<string, string> {
	return {
		tool_name: invocation.name,
		...taxonomyAttributes(invocation),
		...clientAttributes,
	};
}

function createAttributes(
	invocation: SafeToolInvocation,
): Record<string, AttributeValue> {
	const clientMetadata = getCurrentMcpClientMetadata();
	const isPrompt = invocation.kind === "prompt";
	const sessionId = getCurrentMcpSessionId();
	const attributes: Record<string, AttributeValue> = {
		"mcp.span.category": DISCOVERY_TOOL_NAMES.has(invocation.name)
			? "discovery"
			: "tool",
		[isPrompt ? "mcp.prompt.name" : "mcp.tool.name"]: invocation.name,
		"mcp.operation.kind": invocation.kind ?? "tool",
		...taxonomyAttributes(invocation),
		"mcp.client.name": clientMetadata.name,
		"mcp.client.version": clientMetadata.version,
		"mcp.protocol.version": clientMetadata.protocolVersion,
		"mcp.transport": getCurrentMcpTransport(),
		"mcp.tool.args.key_count_bucket":
			invocation.argumentKeyCountBucket ?? "unknown",
		"mcp.tool.args.keys": invocation.argumentKeys?.join(",") ?? "",
		...(sessionId ? { "mcp.session.id": sessionId } : {}),
	};
	for (const key of Object.keys(invocation.argumentPresence ?? {})) {
		attributes[`mcp.tool.args.${key}.present`] = true;
	}
	for (const [key, bucket] of Object.entries(
		invocation.numericArgumentBuckets ?? {},
	)) {
		if (bucket !== undefined) {
			attributes[`mcp.tool.args.${key}.bucket`] = bucket;
		}
	}
	for (const [key, value] of Object.entries(
		invocation.booleanArguments ?? {},
	)) {
		if (value !== undefined) attributes[`mcp.tool.args.${key}`] = value;
	}
	return attributes;
}

function setResultAttributes(span: Span, completion: SafeToolCompletion): void {
	const result = completion.result;
	if (!result) return;
	span.setAttribute("mcp.tool.result.is_error", result.isError);
	span.setAttribute(
		"mcp.tool.result.has_structured_content",
		result.hasStructuredContent,
	);
	span.setAttribute(
		"mcp.tool.result.content_count_bucket",
		result.contentCountBucket,
	);
	const summary = result.summary;
	if (!summary) return;
	if (summary.itemCountBucket) {
		span.setAttribute(
			"mcp.tool.result.item_count_bucket",
			summary.itemCountBucket,
		);
	}
	if (summary.exerciseCountBucket) {
		span.setAttribute(
			"mcp.tool.result.exercise_count_bucket",
			summary.exerciseCountBucket,
		);
	}
	if (summary.setCountBucket) {
		span.setAttribute(
			"mcp.tool.result.set_count_bucket",
			summary.setCountBucket,
		);
	}
	if (summary.workflow) {
		span.setAttribute("workflow.name", summary.workflow.name);
		span.setAttribute("workflow.cache_status", summary.workflow.cacheStatus);
		span.setAttribute("workflow.items_scanned", summary.workflow.itemsScanned);
		for (const [resource, pageCount] of Object.entries(
			summary.workflow.pagination,
		)) {
			if (
				WORKFLOW_PAGINATION_RESOURCES.has(resource) &&
				Number.isSafeInteger(pageCount) &&
				pageCount >= 0
			) {
				span.setAttribute(`workflow.pagination.${resource}.pages`, pageCount);
			}
		}
	}
}

function createFailureAttributes(
	invocation: SafeToolInvocation,
	completion: SafeToolCompletion,
	errorType = completion.errorType ?? "UNKNOWN_ERROR",
): Record<string, AttributeValue> {
	const diagnostic = completion.error;
	const execution = projectExecutionAttributes(
		createExecutionProjection(diagnostic),
	);
	return {
		[invocation.kind === "prompt" ? "mcp.prompt.name" : "mcp.tool.name"]:
			invocation.name,
		"error.type": errorType,
		"error.category": diagnostic?.category ?? "UnknownError",
		...(diagnostic?.code ? { "error.code": diagnostic.code } : {}),
		...(diagnostic?.status !== undefined
			? { "http.response.status_code": diagnostic.status }
			: {}),
		...(diagnostic?.method ? { "http.request.method": diagnostic.method } : {}),
		...(diagnostic?.endpoint
			? { "hevy.api.endpoint": diagnostic.endpoint }
			: {}),
		...execution,
	};
}

function setSafeErrorAttributes(
	span: Span,
	invocation: SafeToolInvocation,
	completion: SafeToolCompletion,
): string {
	const errorType = completion.errorType ?? "UNKNOWN_ERROR";
	const attributes = createFailureAttributes(invocation, completion, errorType);
	if (completion.error) {
		span.addEvent("mcp.tool.failure", attributes);
	}
	for (const [key, value] of Object.entries(
		projectExecutionAttributes(createExecutionProjection(completion.error)),
	)) {
		span.setAttribute(key, value);
	}
	span.setAttribute("error.type", errorType);
	return errorType;
}

function bestEffort(operation: () => void): void {
	try {
		operation();
	} catch {
		// Observability failures must never alter tool behavior.
	}
}

/** Node-only adapter from core's privacy-safe observation contract to OTel. */
export function createNodeToolObserver(): ToolObserver {
	return {
		start(invocation): ToolObservationScope {
			const startedAt = Date.now();
			const clientAttributes = recordMcpToolInvocation();
			const metrics = metricAttributes(invocation, clientAttributes);
			bestEffort(() => toolInvocations.add(1, metrics));
			let completion: SafeToolCompletion | undefined;
			let activeSpan: Span | undefined;
			let thrownError: unknown;
			return {
				run<T>(operation: () => Promise<T>): Promise<T> {
					return tracer.startActiveSpan(
						`mcp.tool.${invocation.name}`,
						{ attributes: createAttributes(invocation) },
						async (span) => {
							activeSpan = span;
							try {
								return await operation();
							} catch (error) {
								thrownError = error;
								throw error;
							}
						},
					);
				},
				finish(nextCompletion) {
					if (completion) return;
					completion = nextCompletion;
					const durationMs = Math.max(
						0,
						nextCompletion.durationMs || Date.now() - startedAt,
					);
					const isError = nextCompletion.outcome !== "success";
					if (isError) bestEffort(recordMcpToolFailure);
					bestEffort(() =>
						toolOutcomes.add(1, {
							...metrics,
							outcome: nextCompletion.outcome,
						}),
					);
					let errorType: string | undefined;
					try {
						if (activeSpan) {
							activeSpan.setStatus({
								code:
									nextCompletion.outcome === "success" &&
									nextCompletion.result?.isError !== true
										? SpanStatusCode.OK
										: SpanStatusCode.ERROR,
							});
							activeSpan.setAttribute(
								"mcp.tool.outcome",
								nextCompletion.outcome,
							);
							setResultAttributes(activeSpan, nextCompletion);
							if (nextCompletion.outcome === "thrown_error") {
								errorType = setSafeErrorAttributes(
									activeSpan,
									invocation,
									nextCompletion,
								);
							}
							if (nextCompletion.outcome === "returned_error") {
								const execution = projectExecutionAttributes(
									nextCompletion.errorOutcome,
								);
								activeSpan.addEvent("mcp.tool.failure", {
									"mcp.tool.name": invocation.name,
									"error.type": "UNKNOWN_ERROR",
									"error.category": "McpToolReturnedError",
									"error.code": "MCP_TOOL_RETURNED_ERROR",
									...execution,
								});
								activeSpan.setAttribute("error.type", "UNKNOWN_ERROR");
								for (const [key, value] of Object.entries(execution)) {
									activeSpan.setAttribute(key, value);
								}
							}
						}
					} catch {
						// Instrumentation metadata must never alter the MCP response.
					} finally {
						if (nextCompletion.outcome === "thrown_error") {
							const error =
								thrownError ??
								new Error(nextCompletion.error?.category ?? errorType);
							bestEffort(() =>
								captureFailure(error, {
									kind: invocation.kind === "prompt" ? "prompt" : "tool",
									attributes: createFailureAttributes(
										invocation,
										nextCompletion,
										errorType,
									),
									span: activeSpan,
								}),
							);
							bestEffort(() =>
								toolErrors.add(1, {
									...metrics,
									error_type:
										errorType ?? nextCompletion.errorType ?? "UNKNOWN_ERROR",
								}),
							);
						}
						bestEffort(() =>
							toolDuration.record(durationMs, {
								...metrics,
								is_error: String(isError),
								outcome: nextCompletion.outcome,
							}),
						);
						bestEffort(() => activeSpan?.end());
						activeSpan = undefined;
					}
				},
			};
		},
	};
}
