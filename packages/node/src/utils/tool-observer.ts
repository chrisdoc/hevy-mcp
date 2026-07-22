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
import { tracer } from "./telemetry.js";

function createAttributes(invocation: SafeToolInvocation) {
	return {
		"mcp.tool.name": invocation.name,
		"mcp.transport": "stdio",
		"mcp.tool.argument_key_count_bucket":
			invocation.argumentKeyCountBucket ?? "unknown",
		"mcp.tool.argument_keys": invocation.argumentKeys?.join(",") ?? "",
	};
}

function setResultAttributes(span: Span, completion: SafeToolCompletion): void {
	const result = completion.result;
	if (!result) return;
	span.setAttribute("mcp.tool.result.is_error", result.isError);
	span.setAttribute(
		"mcp.tool.result.has_structured_content",
		result.hasStructuredContent,
	);
	span.setAttribute("mcp.tool.result.content_count", result.contentCount);
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
			if (Number.isSafeInteger(pageCount) && pageCount >= 0) {
				span.setAttribute(`workflow.pagination.${resource}.pages`, pageCount);
			}
		}
	}
}

/** Node-only adapter from core's privacy-safe observation contract to OTel. */
export function createNodeToolObserver(): ToolObserver {
	return {
		start(invocation): ToolObservationScope {
			const startedAt = Date.now();
			toolInvocations.add(1, { tool: invocation.name });
			let completion: SafeToolCompletion | undefined;
			let activeSpan: Span | undefined;
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
								span.recordException(error as Error);
								span.setStatus({ code: SpanStatusCode.ERROR });
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
					toolDuration.record(durationMs, { tool: invocation.name });
					toolOutcomes.add(1, {
						tool: invocation.name,
						outcome: nextCompletion.outcome,
					});
					if (nextCompletion.outcome === "thrown_error") {
						toolErrors.add(1, { tool: invocation.name });
					}
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
						}
					} catch {
						// Instrumentation metadata must never alter the MCP response.
					} finally {
						activeSpan?.end();
						activeSpan = undefined;
					}
				},
			};
		},
	};
}
