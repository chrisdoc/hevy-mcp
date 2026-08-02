import type { CacheObservationMetadata, CacheObserver } from "@hevy-mcp/core";
import type {
	HevyClientOptions,
	HevyRequestObservation,
	HevyRequestStart,
} from "@hevy-mcp/hevy-client";
import { SpanStatusCode, type Span } from "@opentelemetry/api";
import { debugLog } from "./debug.js";
import { apiCalls, apiDuration } from "./metrics.js";
import { bucketCount } from "./result-telemetry.js";
import {
	getCurrentMcpSessionId,
	getCurrentMcpTransport,
} from "./mcp-session-observability.js";
import { tracer } from "./telemetry.js";

const SAFE_OBSERVATION_CODES = new Set([
	"EAI_AGAIN",
	"ECONNABORTED",
	"ECONNREFUSED",
	"ECONNRESET",
	"ENETUNREACH",
	"ENOTFOUND",
	"ERR_NETWORK",
	"ERR_SOCKET_TIMEOUT",
	"ETIMEDOUT",
	"HEVY_REQUEST_ABORTED",
	"HEVY_RETRY_EXHAUSTED",
]);

function safeErrorAttributes(observation: HevyRequestObservation): {
	error_category?: string;
	error_code?: string;
} {
	if (!observation.error) return {};
	const code = observation.error.code;
	return {
		error_category: observation.error.category ?? "HevyHttpError",
		...(code && SAFE_OBSERVATION_CODES.has(code) ? { error_code: code } : {}),
	};
}

function startApiSpan(start: HevyRequestStart) {
	const sessionId = getCurrentMcpSessionId();
	return tracer.startActiveSpan(
		`hevy.api.${start.method}`,
		{
			attributes: {
				"mcp.span.category": "api",
				"http.method": start.method,
				"hevy.api.endpoint": start.endpoint,
				"hevy.api.retry_count_bucket": bucketCount(start.retryCount),
				"mcp.transport": getCurrentMcpTransport(),
				...(sessionId ? { "mcp.session.id": sessionId } : {}),
			},
		},
		(span) => span,
	);
}

function finishApiSpan(span: Span, observation: HevyRequestObservation): void {
	const errorAttributes = safeErrorAttributes(observation);
	span.setAttribute("http.status_code", observation.status);
	span.setAttribute("hevy.api.outcome", observation.outcome);
	if (observation.expectedReason) {
		span.setAttribute("hevy.api.expected_reason", observation.expectedReason);
	}
	for (const [key, value] of Object.entries(errorAttributes)) {
		span.setAttribute(key, value);
	}
	span.setStatus({
		code:
			observation.outcome === "success" || observation.outcome === "expected"
				? SpanStatusCode.OK
				: SpanStatusCode.ERROR,
	});
	if (observation.outcome !== "success" && observation.outcome !== "expected") {
		span.addEvent("hevy.api.failure", {
			"error.category": errorAttributes.error_category ?? "HevyHttpError",
			...(errorAttributes.error_code
				? { "error.code": errorAttributes.error_code }
				: {}),
		});
	}
	span.end();
}

/** Node-only adapter; the Worker graph never imports telemetry or metrics. */
export function createNodeHevyClientOptions(): HevyClientOptions {
	const rawTimeout = process.env.HEVY_MCP_API_TIMEOUT;
	const parsedTimeout = rawTimeout ? Number(rawTimeout) : Number.NaN;
	const timeoutMs =
		Number.isFinite(parsedTimeout) && parsedTimeout > 0
			? Math.floor(parsedTimeout)
			: undefined;
	return {
		...(timeoutMs ? { timeoutMs } : {}),
		onRequestStart(start) {
			const span = startApiSpan(start);
			return {
				finish(observation) {
					finishApiSpan(span, observation);
				},
			};
		},
		onRequestComplete(observation) {
			const retryCountBucket = bucketCount(observation.retryCount);
			const errorAttributes = safeErrorAttributes(observation);
			apiCalls.add(1, {
				method: observation.method,
				endpoint: observation.endpoint,
				status_code: observation.status,
				retry_count_bucket: retryCountBucket,
				outcome: observation.outcome,
				...(observation.expectedReason
					? { expected_reason: observation.expectedReason }
					: {}),
				...errorAttributes,
			});
			apiDuration.record(observation.durationMs, {
				method: observation.method,
				endpoint: observation.endpoint,
				retry_count_bucket: retryCountBucket,
				outcome: observation.outcome,
				...(observation.expectedReason
					? { expected_reason: observation.expectedReason }
					: {}),
				...errorAttributes,
			});
			debugLog("api_response", {
				method: observation.method,
				endpoint: observation.endpoint,
				durationMs: observation.durationMs,
				status: observation.status || null,
				retryCountBucket,
				outcome: observation.outcome,
				...errorAttributes,
			});
		},
		onRetryWait(observation) {
			const sessionId = getCurrentMcpSessionId();
			const span = tracer.startSpan("hevy.api.retry_wait", {
				attributes: {
					"mcp.span.category": "api",
					"http.method": observation.method,
					"hevy.api.endpoint": observation.endpoint,
					"hevy.api.retry_count_bucket": bucketCount(observation.retryCount),
					"hevy.api.retry_wait_ms": Math.max(
						0,
						Math.min(5_000, observation.delayMs),
					),
					"mcp.transport": getCurrentMcpTransport(),
					...(sessionId ? { "mcp.session.id": sessionId } : {}),
				},
			});
			return { finish: () => span.end() };
		},
	};
}
export function createNodeCacheObserver(): CacheObserver {
	return {
		start(observation) {
			const sessionId = getCurrentMcpSessionId();
			const span = tracer.startSpan(`hevy.cache.${observation.state}`, {
				attributes: {
					"mcp.span.category": "cache",
					"hevy.cache.state": observation.state,
					"mcp.transport": getCurrentMcpTransport(),
					...(sessionId ? { "mcp.session.id": sessionId } : {}),
				},
			});
			return {
				finish(metadata?: CacheObservationMetadata) {
					if (metadata?.refreshReason) {
						span.setAttribute(
							"hevy.cache.refresh_reason",
							metadata.refreshReason,
						);
					}
					if (metadata?.pageCountBucket) {
						span.setAttribute(
							"hevy.cache.page_count_bucket",
							metadata.pageCountBucket,
						);
					}
					if (metadata?.itemCountBucket) {
						span.setAttribute(
							"hevy.cache.item_count_bucket",
							metadata.itemCountBucket,
						);
					}
					span.end();
				},
			};
		},
	};
}
