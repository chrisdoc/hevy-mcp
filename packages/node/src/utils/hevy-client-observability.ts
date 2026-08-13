import type { CacheObservationMetadata, CacheObserver } from "@hevy-mcp/core";
import {
	diagnosticEndpointIdentity,
	metricEndpointIdentity,
	SAFE_OBSERVATION_CODES,
} from "@hevy-mcp/hevy-client";
import type {
	HevyClientOptions,
	HevyRequestObservation,
	HevyRequestStart,
} from "@hevy-mcp/hevy-client";
import { context, SpanStatusCode, trace, type Span } from "@opentelemetry/api";
import { debugLog } from "./debug.js";
import { apiCalls, apiDuration } from "./metrics.js";
import { bucketCount } from "./result-telemetry.js";
import {
	getCurrentMcpSessionId,
	getCurrentMcpTransport,
} from "./mcp-session-observability.js";
import { projectExecutionAttributes } from "./execution-telemetry.js";
import { tracer } from "./telemetry.js";

interface SafeErrorAttributes {
	error_category?: string;
	error_code?: string;
}

interface ApiSpanAttributes {
	[key: string]: string | number;
}

interface MetricAttributes {
	[key: string]: string | number | boolean;
}

interface DebugAttributes {
	[key: string]: string | number | boolean | null;
}

interface StringAttributes {
	[key: string]: string;
}

function safeErrorAttributes(
	observation: HevyRequestObservation,
): SafeErrorAttributes {
	if (!observation.error) return {};
	const code = observation.error.code;
	const attributes: SafeErrorAttributes = {
		error_category: observation.error.category ?? "HevyHttpError",
	};
	if (code && SAFE_OBSERVATION_CODES.has(code)) attributes.error_code = code;
	return attributes;
}

function getDiagnosticResponseError(
	observation: HevyRequestObservation,
): string | undefined {
	return process.env.HEVY_MCP_TELEMETRY_DIAGNOSTICS === "0"
		? undefined
		: observation.error?.response_error;
}

function startApiSpan(start: HevyRequestStart) {
	const sessionId = getCurrentMcpSessionId();
	const diagnosticEndpoint = diagnosticEndpointIdentity(start.endpoint);
	const attributes: ApiSpanAttributes = {
		"mcp.span.category": "api",
		"http.request.method": start.method,
		"hevy.api.retry_count_bucket": bucketCount(start.retryCount),
		"mcp.transport": getCurrentMcpTransport(),
	};
	if (diagnosticEndpoint) attributes["hevy.api.endpoint"] = diagnosticEndpoint;
	if (sessionId) attributes["mcp.session.id"] = sessionId;
	return tracer.startSpan(`hevy.api.${start.method}`, { attributes });
}
function finishApiSpan(span: Span, observation: HevyRequestObservation): void {
	const errorAttributes = safeErrorAttributes(observation);
	if (observation.status > 0) {
		span.setAttribute("http.response.status_code", observation.status);
	}
	for (const [key, value] of Object.entries(
		projectExecutionAttributes(observation),
	)) {
		span.setAttribute(key, value);
	}
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
		const responseError = getDiagnosticResponseError(observation);
		const failureAttributes: StringAttributes = {
			"error.category": errorAttributes.error_category ?? "HevyHttpError",
		};
		if (errorAttributes.error_code)
			failureAttributes["error.code"] = errorAttributes.error_code;
		if (responseError)
			failureAttributes["hevy.api.response_error"] = responseError;
		span.addEvent("hevy.api.failure", failureAttributes);
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
	const options: HevyClientOptions = {
		onRequestStart(start) {
			const span = startApiSpan(start);
			return {
				run<T>(operation: () => Promise<T>) {
					return context.with(trace.setSpan(context.active(), span), operation);
				},
				finish(observation) {
					finishApiSpan(span, observation);
				},
			};
		},
		onRequestComplete(observation) {
			const retryCountBucket = bucketCount(observation.retryCount);
			const errorAttributes = safeErrorAttributes(observation);
			const responseError = getDiagnosticResponseError(observation);
			const metricEndpoint = metricEndpointIdentity(observation.endpoint);
			const diagnosticEndpoint = diagnosticEndpointIdentity(
				observation.endpoint,
			);
			const metricExecutionAttributes = projectExecutionAttributes(
				observation,
				"metric",
			);
			const metricAttributes: MetricAttributes = {
				...metricExecutionAttributes,
				transport: getCurrentMcpTransport(),
				...errorAttributes,
			};
			if (observation.expectedReason)
				metricAttributes.expected_reason = observation.expectedReason;
			apiCalls.add(1, {
				method: observation.method,
				endpoint: metricEndpoint,
				status_code: observation.status,
				retry_count_bucket: retryCountBucket,
				...metricAttributes,
			});
			apiDuration.record(observation.durationMs, {
				method: observation.method,
				endpoint: metricEndpoint,
				retry_count_bucket: retryCountBucket,
				...metricAttributes,
			});
			const debugAttributes: DebugAttributes = {
				method: observation.method,
				durationMs: observation.durationMs,
				status: observation.status || null,
				retryCountBucket,
				outcome: observation.outcome,
				...errorAttributes,
			};
			if (diagnosticEndpoint) debugAttributes.endpoint = diagnosticEndpoint;
			if (responseError) debugAttributes.response_error = responseError;
			debugLog("api_response", debugAttributes);
		},
		onRetryWait(observation) {
			const sessionId = getCurrentMcpSessionId();
			const attributes: ApiSpanAttributes = {
				"mcp.span.category": "api",
				"http.request.method": observation.method,
				"hevy.api.retry_count_bucket": bucketCount(observation.retryCount),
				"hevy.api.retry_wait_ms": Math.max(
					0,
					Math.min(5_000, observation.delayMs),
				),
			};
			if (sessionId) attributes["mcp.session.id"] = sessionId;
			const span = tracer.startSpan("hevy.api.retry_wait", { attributes });
			return { finish: () => span.end() };
		},
	};
	if (timeoutMs) options.timeoutMs = timeoutMs;
	return options;
}
export function createNodeCacheObserver(): CacheObserver {
	return {
		start(observation) {
			const sessionId = getCurrentMcpSessionId();
			const attributes: StringAttributes = {
				"mcp.span.category": "cache",
				"hevy.cache.state": observation.state,
				"mcp.transport": getCurrentMcpTransport(),
			};
			if (sessionId) attributes["mcp.session.id"] = sessionId;
			const span = tracer.startSpan(`hevy.cache.${observation.state}`, {
				attributes,
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
