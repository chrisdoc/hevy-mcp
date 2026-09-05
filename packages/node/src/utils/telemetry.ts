/**
 * Centralized telemetry initialization.
 *
 * It sets up independent telemetry paths: Sentry error events and an OTel
 * Collector (traces + metrics to Honeycomb).
 *
 * Sentry SDK: error monitoring, release tracking
 * OTel Collector → Honeycomb: performance traces, metrics
 */

import { randomBytes, randomUUID as nodeRandomUUID } from "node:crypto";
import { z } from "zod";
import { Effect, Layer } from "effect";
import * as Sentry from "@sentry/node";
import { metrics, trace } from "@opentelemetry/api";

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
	AggregationTemporalityPreference,
	OTLPMetricExporter,
} from "@opentelemetry/exporter-metrics-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
	AlwaysOnSampler,
	BatchSpanProcessor,
	type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
	MeterProvider,
	PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { captureFailure, sanitizeSentryEvent } from "./failure-reporter.js";
export type ProcessExceptionSource = {
	on(
		event: "uncaughtExceptionMonitor" | "unhandledRejection",
		listener: (error: Error | string) => void,
	): void;
	removeListener(
		event: "uncaughtExceptionMonitor" | "unhandledRejection",
		listener: (error: Error | string) => void,
	): void;
};

const PROCESS_FAILURE_TAXONOMY = {
	uncaughtException: "uncaught_exception",
	unhandledRejection: "unhandled_rejection",
} as const;

export function installProcessExceptionTracking(
	processLike: ProcessExceptionSource = process,
): () => void {
	if (!telemetryEnabled) return () => {};
	const recordProcessException = (
		source: keyof typeof PROCESS_FAILURE_TAXONOMY,
		error: Error | string,
	) => {
		try {
			tracer.startActiveSpan(
				`mcp.process.${source}`,
				{ attributes: { "mcp.span.category": "process" } },
				(span) => {
					try {
						captureFailure(error, {
							kind: "process",
							attributes: {
								"exception.source": source,
								"mcp.failure.phase": PROCESS_FAILURE_TAXONOMY[source],
								"error.type": "MCP_PROCESS_EXCEPTION",
								"error.category": "McpProcessFailure",
							},
							span,
						});
					} finally {
						span.end();
					}
				},
			);
		} catch {
			// Process telemetry must never affect Node's lifecycle.
		}
	};
	const uncaughtException = (error: Error | string) =>
		recordProcessException("uncaughtException", error);
	const unhandledRejection = (error: Error | string) =>
		recordProcessException("unhandledRejection", error);
	let cleaned = false;
	const installedListeners: Array<{
		event: "uncaughtExceptionMonitor" | "unhandledRejection";
		listener: (error: Error | string) => void;
	}> = [];
	const removeInstalledListeners = () => {
		if (cleaned) return;
		cleaned = true;
		for (const { event, listener } of installedListeners.toReversed()) {
			try {
				processLike.removeListener(event, listener);
			} catch {
				// Listener cleanup must not replace the original acquisition error.
			}
		}
	};

	try {
		const listeners = [
			["uncaughtExceptionMonitor", uncaughtException],
			["unhandledRejection", unhandledRejection],
		] as const;
		for (const [event, listener] of listeners) {
			processLike.on(event, listener);
			installedListeners.push({ event, listener });
		}
	} catch (error) {
		removeInstalledListeners();
		throw error;
	}

	return () => {
		removeInstalledListeners();
	};
}

function readBuildGlobal<T>(read: () => T): T | undefined {
	try {
		return read();
	} catch {
		return undefined;
	}
}

function parseBuildString<T>(value: T, fallback: string): string {
	return z.string().parse(value ?? fallback);
}
declare const __HEVY_MCP_NAME__: string | undefined;
declare const __HEVY_MCP_VERSION__: string | undefined;
declare const __HEVY_MCP_BUILD__: boolean | undefined;
declare const __OTEL_COLLECTOR_TOKEN__: string | undefined;

const name = parseBuildString(
	readBuildGlobal(() => __HEVY_MCP_NAME__),
	"hevy-mcp",
);
const version = parseBuildString(
	readBuildGlobal(() => __HEVY_MCP_VERSION__),
	"dev",
);

const telemetryEnabled = process.env.HEVY_MCP_TELEMETRY !== "0";

// Collector token is injected at build time from the OTEL_COLLECTOR_TOKEN
// GitHub secret via tsdown.config.ts define. The collector forwards
// traces and metrics to Honeycomb, keeping the Honeycomb API key off the
// client. The collector endpoint is public (behind Cloudflare Tunnel).
const collectorToken =
	z.string().safeParse(readBuildGlobal(() => __OTEL_COLLECTOR_TOKEN__)).data ??
	process.env.OTEL_COLLECTOR_TOKEN ??
	"";

const COLLECTOR_ENDPOINT = "https://otel.chrisdoc.dev/v1";
const DEFAULT_SENTRY_DSN =
	"https://ce696d8333b507acbf5203eb877bce0f@o4508975499575296.ingest.de.sentry.io/4509049671647312";
const sentryRelease = process.env.SENTRY_RELEASE ?? `${name}@${version}`;

/** Hex-encode bytes without relying on Buffer typings that vary across @types/node releases. */
function toHex(bytes: Uint8Array): string {
	let hex = "";
	for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
	return hex;
}

export function createServiceInstanceId(
	generate: () => string = nodeRandomUUID,
): string {
	try {
		const generated = generate();
		if (generated.length > 0 && generated.length <= 128) return generated;
	} catch {
		// Fall back to a process-local opaque identifier.
	}
	return toHex(randomBytes(16));
}

const serviceInstanceId = createServiceInstanceId();

const resource = resourceFromAttributes({
	"service.name": name,
	"service.version": version,
	"service.instance.id": serviceInstanceId,
	"process.runtime.name": process.release.name,
	"process.runtime.version": process.version,
});

let tracerProvider: NodeTracerProvider | undefined;
let meterProvider: MeterProvider | undefined;
let telemetryInitialized = false;

function initializeTelemetry(): void {
	if (telemetryInitialized || !telemetryEnabled) return;
	try {
		const rawDsn = process.env.SENTRY_DSN ?? DEFAULT_SENTRY_DSN;
		const isValidDsn =
			z.string().safeParse(rawDsn).success &&
			rawDsn.length > 0 &&
			!rawDsn.startsWith("*");

		// --- Sentry error monitoring ---
		Sentry.init({
			dsn: isValidDsn ? rawDsn : undefined,
			release: sentryRelease,
			tracesSampleRate: 0.0,
			sendClientReports: false,
			sendDefaultPii: false,
			beforeSend: sanitizeSentryEvent,
			integrations: (integrations) =>
				integrations.filter(
					(integration) =>
						integration.name !== "OnUncaughtException" &&
						integration.name !== "OnUnhandledRejection",
				),
			skipOpenTelemetrySetup: true,
			registerEsmLoaderHooks: false,
			ignoreErrors: ["EPIPE", "broken pipe"],
		});

		const spanProcessors: SpanProcessor[] = [];

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
						exportIntervalMillis: 30_000,
					}),
				],
			});
			metrics.setGlobalMeterProvider(meterProvider);
		}

		trace.setGlobalTracerProvider(tracerProvider);
		telemetryInitialized = true;
	} catch (error) {
		telemetryInitialized = false;
		tracerProvider = undefined;
		meterProvider = undefined;
		throw error;
	}
}

/**
 * Process-scoped telemetry. Importing this module only creates inert OTel
 * handles; provider registration and Sentry initialization happen when the
 * lifecycle acquires this layer.
 */
export const initializeTelemetryEffect = Effect.try({
	try: initializeTelemetry,
	catch: (error) => error,
});

export const telemetryLayer = Layer.effectDiscard(
	initializeTelemetryEffect.pipe(
		Effect.catch(() => Effect.void),
		Effect.andThen(
			Effect.addFinalizer(() =>
				Effect.promise(() => flushTelemetry().catch(() => undefined)),
			),
		),
	),
);

export async function flushTelemetry(timeoutMs = 1_000): Promise<void> {
	if (!telemetryEnabled) {
		return;
	}

	const flushPromise = Promise.allSettled([
		...(tracerProvider
			? [Promise.resolve().then(() => tracerProvider?.forceFlush())]
			: []),
		...(meterProvider
			? [Promise.resolve().then(() => meterProvider?.forceFlush())]
			: []),
		Promise.resolve().then(() => Sentry.flush(timeoutMs)),
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
export {
	captureFailure,
	normalizeFailure,
	sanitizeDiagnosticText,
	sanitizeSentryEvent,
} from "./failure-reporter.js";
export type {
	FailureContext,
	FailureKind,
	FailureReceipt,
	NormalizedFailure,
	TelemetryAttributeValue,
	TelemetryAttributes,
} from "./failure-reporter.js";
