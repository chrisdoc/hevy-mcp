import { SpanStatusCode, type Span } from "@opentelemetry/api";
import type {
	SafeToolCompletion,
	SafeToolInvocation,
	ToolObservationScope,
	ToolObserver,
} from "@hevy-mcp/core";
import {
	toolDuration,
	toolErrors,
	toolInvocations,
	toolOutcomes,
} from "./metrics.js";
import {
	getCurrentMcpClientMetadata,
	recordMcpToolFailure,
	recordMcpToolInvocation,
} from "./mcp-session-observability.js";
import type { McpClientMetricAttributes } from "./mcp-session-observability.js";
import { Sentry, tracer } from "./telemetry.js";

type AttributeValue = string | number | boolean;

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
	const attributes: Record<string, AttributeValue> = {
		"mcp.tool.name": invocation.name,
		...taxonomyAttributes(invocation),
		"mcp.client.name": clientMetadata.name,
		"mcp.client.version": clientMetadata.version,
		"mcp.protocol.version": clientMetadata.protocolVersion,
		"mcp.transport": "stdio",
		"mcp.tool.args.key_count_bucket":
			invocation.argumentKeyCountBucket ?? "unknown",
		"mcp.tool.args.keys": invocation.argumentKeys?.join(",") ?? "",
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

function resultMetricAttributes(
	completion: SafeToolCompletion,
): Record<string, string | boolean> {
	const result = completion.result;
	if (!result) return {};
	const attributes: Record<string, string | boolean> = {
		"mcp.tool.result.has_structured_content": result.hasStructuredContent,
		"mcp.tool.result.content_count_bucket": result.contentCountBucket,
	};
	const summary = result.summary;
	if (summary?.itemCountBucket) {
		attributes["mcp.tool.result.item_count_bucket"] = summary.itemCountBucket;
	}
	if (summary?.exerciseCountBucket) {
		attributes["mcp.tool.result.exercise_count_bucket"] =
			summary.exerciseCountBucket;
	}
	if (summary?.setCountBucket) {
		attributes["mcp.tool.result.set_count_bucket"] = summary.setCountBucket;
	}
	return attributes;
}

function setSafeErrorAttributes(
	span: Span,
	completion: SafeToolCompletion,
): string {
	const diagnostic = completion.error;
	const errorType = completion.errorType ?? "UNKNOWN_ERROR";
	if (diagnostic) {
		span.addEvent("mcp.tool.failure", {
			"error.category": diagnostic.category,
			...(diagnostic.code ? { "error.code": diagnostic.code } : {}),
			...(diagnostic.status !== undefined
				? { "http.status_code": diagnostic.status }
				: {}),
			...(diagnostic.method ? { "http.method": diagnostic.method } : {}),
			...(diagnostic.endpoint
				? { "hevy.api.endpoint": diagnostic.endpoint }
				: {}),
		});
	}
	span.setAttribute("error.type", errorType);
	return errorType;
}

function captureSafeToolFailure(
	invocation: SafeToolInvocation,
	completion: SafeToolCompletion,
): void {
	const diagnostic = completion.error;
	const category = diagnostic?.category ?? "UnknownError";
	try {
		Sentry.withScope((scope) => {
			scope.setTag("mcp.tool.context", invocation.name);
			scope.setTag("error.category", category);
			if (diagnostic?.code) scope.setTag("error.code", diagnostic.code);
			if (diagnostic?.status !== undefined) {
				scope.setTag("http.status_code", String(diagnostic.status));
			}
			if (diagnostic?.endpoint) {
				scope.setTag("hevy.api.endpoint", diagnostic.endpoint);
			}
			scope.setContext("mcpTool", {
				context: invocation.name,
				argumentKeyCountBucket: invocation.argumentKeyCountBucket ?? "unknown",
			});
			scope.setContext("safeError", diagnostic ? { ...diagnostic } : {});
			scope.setFingerprint([
				"mcp-tool-failure",
				invocation.name,
				category,
				diagnostic?.code ?? "none",
				String(diagnostic?.status ?? "none"),
				diagnostic?.endpoint ?? "none",
			]);
			Sentry.captureMessage("MCP tool failure", "error");
		});
	} catch {
		// Sentry failures must never affect tool responses.
	}
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
			return {
				run<T>(operation: () => Promise<T>): Promise<T> {
					return tracer.startActiveSpan(
						`mcp.tool.${invocation.name}`,
						{ attributes: createAttributes(invocation) },
						async (span) => {
							activeSpan = span;
							return operation();
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
								errorType = setSafeErrorAttributes(activeSpan, nextCompletion);
							}
						}
					} catch {
						// Instrumentation metadata must never alter the MCP response.
					} finally {
						if (nextCompletion.outcome === "thrown_error") {
							bestEffort(() =>
								captureSafeToolFailure(invocation, nextCompletion),
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
								...resultMetricAttributes(nextCompletion),
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
