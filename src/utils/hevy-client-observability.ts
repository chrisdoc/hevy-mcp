import { SpanStatusCode } from "@opentelemetry/api";
import { debugLog } from "./debug.js";
import type { HevyClientOptions } from "./hevyClientKubb.js";
import { apiCalls, apiDuration } from "./metrics.js";
import { getCurrentUserId, tracer } from "./telemetry.js";

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
			const span = tracer.startSpan(`hevy.api.${observation.method}`, {
				attributes: {
					"http.method": observation.method,
					"http.status_code": observation.status,
					"hevy.api.endpoint": observation.endpoint,
					...(getCurrentUserId()
						? { "user.id": getCurrentUserId() as string }
						: {}),
				},
			});
			span.setStatus({
				code: observation.error ? SpanStatusCode.ERROR : SpanStatusCode.OK,
			});
			if (observation.error) span.recordException(observation.error);
			span.end();
			apiCalls.add(1, {
				method: observation.method,
				endpoint: observation.endpoint,
				status_code: observation.status,
			});
			apiDuration.record(observation.durationMs, {
				method: observation.method,
				endpoint: observation.endpoint,
			});
			debugLog("api_response", {
				method: observation.method,
				endpoint: observation.endpoint,
				durationMs: observation.durationMs,
				status: observation.status || null,
			});
		},
	};
}
