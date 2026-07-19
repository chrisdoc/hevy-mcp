import { SpanStatusCode } from "@opentelemetry/api";
import { debugLog } from "./debug.js";
import type { HevyClientOptions } from "./hevyClientKubb.js";
import { apiCalls, apiDuration } from "./metrics.js";
import { createSafeErrorDiagnostic } from "./safe-error-diagnostic.js";
import { bucketCount } from "./result-telemetry.js";
import { tracer } from "./telemetry.js";

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
		onRequestComplete(observation) {
			const retryCountBucket = bucketCount(observation.retryCount);
			const diagnostic = observation.error
				? createSafeErrorDiagnostic(observation.error)
				: undefined;
			const safeErrorAttributes = diagnostic
				? {
						error_category: diagnostic.category,
						...(diagnostic.code ? { error_code: diagnostic.code } : {}),
					}
				: {};
			const span = tracer.startSpan(`hevy.api.${observation.method}`, {
				attributes: {
					"http.method": observation.method,
					"http.status_code": observation.status,
					"hevy.api.retry_count_bucket": retryCountBucket,
					"hevy.api.endpoint": observation.endpoint,
				},
			});
			span.setStatus({
				code: observation.error ? SpanStatusCode.ERROR : SpanStatusCode.OK,
			});
			if (diagnostic) {
				span.addEvent("hevy.api.failure", {
					"error.category": diagnostic.category,
					...(diagnostic.code ? { "error.code": diagnostic.code } : {}),
				});
			}
			span.end();
			apiCalls.add(1, {
				method: observation.method,
				endpoint: observation.endpoint,
				status_code: observation.status,
				retry_count_bucket: retryCountBucket,
				...safeErrorAttributes,
			});
			apiDuration.record(observation.durationMs, {
				method: observation.method,
				endpoint: observation.endpoint,
				retry_count_bucket: retryCountBucket,
				...safeErrorAttributes,
			});
			debugLog("api_response", {
				method: observation.method,
				endpoint: observation.endpoint,
				durationMs: observation.durationMs,
				status: observation.status || null,
				retryCountBucket,
				...safeErrorAttributes,
			});
		},
	};
}
