/**
 * Centralized telemetry initialization.
 *
 * This module MUST be imported before any other application code.
 * It sets up independent telemetry paths: Sentry error events and an OTel
 * Collector (traces + metrics to Honeycomb).
 *
 * Sentry SDK: error monitoring, release tracking
 * OTel Collector → Honeycomb: performance traces, metrics
 */

import {
	createHmac,
	randomBytes,
	randomUUID as nodeRandomUUID,
} from "node:crypto";
import * as Sentry from "@sentry/node";
import {
	SpanStatusCode,
	trace,
	metrics,
	type Span as ApiSpan,
} from "@opentelemetry/api";

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
	AggregationTemporalityPreference,
	OTLPMetricExporter,
} from "@opentelemetry/exporter-metrics-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
	AlwaysOnSampler,
	BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type {
	ReadableSpan,
	Span,
	SpanProcessor,
} from "@opentelemetry/sdk-trace";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
	MeterProvider,
	PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
export type ProcessExceptionSource = {
	on(
		event: "uncaughtExceptionMonitor" | "unhandledRejection",
		listener: (error: unknown) => void,
	): void;
	removeListener(
		event: "uncaughtExceptionMonitor" | "unhandledRejection",
		listener: (error: unknown) => void,
	): void;
};

const PROCESS_FAILURE_TAXONOMY = {
	uncaughtException: "uncaught_exception",
	unhandledRejection: "unhandled_rejection",
} as const;

const SAFE_EXCEPTION_TYPES = new Set([
	"AggregateError",
	"DOMException",
	"Error",
	"EvalError",
	"HevyHttpError",
	"RangeError",
	"ReferenceError",
	"SyntaxError",
	"TypeError",
	"URIError",
	"ProtocolError",
	"ZodError",
]);
const SAFE_EXCEPTION_CODES = new Set([
	"EAI_AGAIN",
	"ECONNABORTED",
	"ECONNREFUSED",
	"ECONNRESET",
	"ENETUNREACH",
	"ENOTFOUND",
	"ERR_NETWORK",
	"ERR_SOCKET_TIMEOUT",
	"ETIMEDOUT",
	"HEVY_INVALID_ENDPOINT",
	"HEVY_REQUEST_ABORTED",
	"HEVY_RETRY_EXHAUSTED",
]);

function normalizeTelemetryError(error: unknown): { name: string } {
	const candidate =
		error instanceof Error && typeof error.name === "string"
			? error.name
			: undefined;
	const name =
		candidate && SAFE_EXCEPTION_TYPES.has(candidate)
			? candidate
			: "UnknownError";
	return { name };
}

function getSafeExceptionCode(error: unknown): string | undefined {
	if (!error || typeof error !== "object" || !("code" in error))
		return undefined;
	const code = error.code;
	return typeof code === "string" && SAFE_EXCEPTION_CODES.has(code)
		? code
		: undefined;
}

export function recordTelemetryException(
	error: unknown,
	attributes?: Record<string, string | number | boolean>,
	span?: ApiSpan,
): void {
	if (!telemetryEnabled) return;
	try {
		const target = span ?? trace.getActiveSpan();
		if (!target) return;
		const normalized = normalizeTelemetryError(error);
		target.addEvent("exception", {
			...attributes,
			"exception.type": normalized.name,
		});
		target.setAttribute("exception.type", normalized.name);
		target.setAttribute("error.category", normalized.name);
		if (attributes) target.setAttributes(attributes);
		target.setStatus({ code: SpanStatusCode.ERROR });
	} catch {
		// Telemetry failures must never affect MCP behavior.
	}
}

export function installProcessExceptionTracking(
	processLike: ProcessExceptionSource = process,
): () => void {
	if (!telemetryEnabled) return () => {};
	const recordProcessException = (
		source: keyof typeof PROCESS_FAILURE_TAXONOMY,
		error: unknown,
	) => {
		try {
			tracer.startActiveSpan(
				`mcp.process.${source}`,
				{ attributes: { "mcp.span.category": "process" } },
				(span) => {
					try {
						const code = getSafeExceptionCode(error);
						recordTelemetryException(
							error,
							{
								"exception.source": source,
								"mcp.failure.phase": PROCESS_FAILURE_TAXONOMY[source],
								"error.type": "MCP_PROCESS_EXCEPTION",
								"error.category": "McpProcessFailure",
								...(code ? { "error.code": code } : {}),
							},
							span,
						);
					} finally {
						span.end();
					}
				},
			);
		} catch {
			// Process telemetry must never affect Node's lifecycle.
		}
	};
	const uncaughtException = (error: unknown) =>
		recordProcessException("uncaughtException", error);
	const unhandledRejection = (error: unknown) =>
		recordProcessException("unhandledRejection", error);
	processLike.on("uncaughtExceptionMonitor", uncaughtException);
	processLike.on("unhandledRejection", unhandledRejection);
	let cleaned = false;
	return () => {
		if (cleaned) return;
		cleaned = true;
		processLike.removeListener("uncaughtExceptionMonitor", uncaughtException);
		processLike.removeListener("unhandledRejection", unhandledRejection);
	};
}

declare const __HEVY_MCP_NAME__: string | undefined;
declare const __HEVY_MCP_VERSION__: string | undefined;
declare const __HEVY_MCP_BUILD__: boolean | undefined;
declare const __OTEL_COLLECTOR_TOKEN__: string | undefined;

const name =
	typeof __HEVY_MCP_NAME__ === "string" ? __HEVY_MCP_NAME__ : "hevy-mcp";
const version =
	typeof __HEVY_MCP_VERSION__ === "string" ? __HEVY_MCP_VERSION__ : "dev";

const telemetryEnabled = process.env.HEVY_MCP_TELEMETRY !== "0";

// Collector token is injected at build time from the OTEL_COLLECTOR_TOKEN
// GitHub secret via tsdown.config.ts define. The collector forwards
// traces and metrics to Honeycomb, keeping the Honeycomb API key off the
// client. The collector endpoint is public (behind Cloudflare Tunnel).
const collectorToken =
	typeof __OTEL_COLLECTOR_TOKEN__ === "string" && __OTEL_COLLECTOR_TOKEN__
		? __OTEL_COLLECTOR_TOKEN__
		: (process.env.OTEL_COLLECTOR_TOKEN ?? "");

const COLLECTOR_ENDPOINT = "https://otel.chrisdoc.dev/v1";
const sentryRelease = process.env.SENTRY_RELEASE ?? `${name}@${version}`;
const DEFAULT_SENTRY_DSN =
	"https://7c08d2c880ff4560a333dff4833594cd@glitchtip.chrisdoc.dev/1";

export function createServiceInstanceId(
	generate: () => string = nodeRandomUUID,
): string {
	try {
		const generated = generate();
		if (generated.length > 0 && generated.length <= 128) return generated;
	} catch {
		// Fall back to a process-local opaque identifier.
	}
	return randomBytes(16).toString("hex");
}

const serviceInstanceId = createServiceInstanceId();

const resource = resourceFromAttributes({
	"service.name": name,
	"service.version": version,
	"service.instance.id": serviceInstanceId,
	"process.runtime.name": process.release.name,
	"process.runtime.version": process.version,
});

// --- OpenTelemetry tracer provider (dual export) ---
let currentUserHash: string | undefined;

class UserHashSpanProcessor implements SpanProcessor {
	onStart(span: Span): void {
		if (currentUserHash) {
			span.setAttribute("user.hash", currentUserHash);
		}
	}

	onEnd(_span: ReadableSpan): void {}

	async forceFlush(): Promise<void> {}

	async shutdown(): Promise<void> {}
}

let tracerProvider: NodeTracerProvider | undefined;
let meterProvider: MeterProvider | undefined;

if (telemetryEnabled) {
	const rawDsn = process.env.SENTRY_DSN ?? DEFAULT_SENTRY_DSN;
	const isValidDsn =
		typeof rawDsn === "string" && rawDsn.length > 0 && !rawDsn.startsWith("*");

	// --- Sentry error monitoring ---
	Sentry.init({
		dsn: isValidDsn ? rawDsn : undefined,
		release: sentryRelease,
		tracesSampleRate: 0.0,
		sendDefaultPii: false,
		skipOpenTelemetrySetup: true,
		registerEsmLoaderHooks: false,
		ignoreErrors: ["EPIPE", "broken pipe"],
	});

	const spanProcessors: SpanProcessor[] = [new UserHashSpanProcessor()];

	// OTel Collector → Honeycomb traces — only if token is available
	if (collectorToken) {
		spanProcessors.push(
			new BatchSpanProcessor(
				new OTLPTraceExporter({
					url: `${COLLECTOR_ENDPOINT}/traces`,
					headers: {
						Authorization: `Bearer ${collectorToken}`,
					},
				}),
			),
		);
	}

	tracerProvider = new NodeTracerProvider({
		resource,
		sampler: new AlwaysOnSampler(),
		spanProcessors,
	});

	tracerProvider.register();

	// --- OpenTelemetry meter provider (→ Collector → Honeycomb metrics) ---
	if (collectorToken) {
		meterProvider = new MeterProvider({
			resource,
			readers: [
				new PeriodicExportingMetricReader({
					exporter: new OTLPMetricExporter({
						url: `${COLLECTOR_ENDPOINT}/metrics`,
						headers: {
							Authorization: `Bearer ${collectorToken}`,
						},
						temporalityPreference: AggregationTemporalityPreference.DELTA,
					}),
					exportIntervalMillis: 10_000,
				}),
			],
		});
		metrics.setGlobalMeterProvider(meterProvider);
	}

	trace.setGlobalTracerProvider(tracerProvider);
}

export async function flushTelemetry(timeoutMs = 1_000): Promise<void> {
	if (!telemetryEnabled) {
		return;
	}

	const flushPromise = Promise.allSettled([
		...(tracerProvider ? [tracerProvider.forceFlush()] : []),
		...(meterProvider ? [meterProvider.forceFlush()] : []),
		Sentry.flush(timeoutMs),
	]);
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<void>((resolve) => {
		timeout = setTimeout(resolve, timeoutMs);
	});
	try {
		await Promise.race([flushPromise, timeoutPromise]);
	} finally {
		clearTimeout(timeout);
	}
}

// --- Shared instances for the rest of the codebase ---
export const tracer = trace.getTracer(name);
export const meter = metrics.getMeter(name);
export { Sentry };

/**
 * Bundled service identity — avoids passing name and version as
 * separate primitives throughout the codebase (Data Clumps smell).
 */
export interface ServiceInfo {
	readonly name: string;
	readonly version: string;
}

export const serviceInfo: ServiceInfo = { name, version } as const;
export const serviceName = name;
export const serviceVersion = version;
export { serviceInstanceId };

// --- User context for span attributes ---
const SENTRY_USER_ID_CONTEXT = "hevy-mcp:sentry-user-id:v1";

export function setTelemetryUser(apiKey: string): void {
	if (!telemetryEnabled) {
		return;
	}

	const userHash = createHmac("sha256", apiKey)
		.update(SENTRY_USER_ID_CONTEXT)
		.digest("hex")
		.slice(0, 10);
	currentUserHash = userHash;
	Sentry.setUser({ id: userHash });
}
