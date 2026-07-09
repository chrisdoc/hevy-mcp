/**
 * Centralized telemetry initialization.
 *
 * This module MUST be imported before any other application code.
 * It sets up OpenTelemetry with dual span processors (Sentry + Honeycomb)
 * and a meter provider for Honeycomb metrics.
 *
 * Sentry receives: error events, performance traces, release tracking
 * Honeycomb receives: performance traces, metrics (counters, histograms)
 */

import * as Sentry from "@sentry/node";
import {
	SentryPropagator,
	SentrySampler,
	SentrySpanProcessor,
} from "@sentry/opentelemetry";
import { trace, metrics } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import type { SpanProcessor } from "@opentelemetry/sdk-trace";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
	MeterProvider,
	PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";

declare const __HEVY_MCP_NAME__: string | undefined;
declare const __HEVY_MCP_VERSION__: string | undefined;
declare const __HEVY_MCP_BUILD__: boolean | undefined;
declare const __HONEYCOMB_API_KEY__: string | undefined;

const name =
	typeof __HEVY_MCP_NAME__ === "string" ? __HEVY_MCP_NAME__ : "hevy-mcp";
const version =
	typeof __HEVY_MCP_VERSION__ === "string" ? __HEVY_MCP_VERSION__ : "dev";

// Honeycomb API key is injected at build time from the HONEYCOMB_API_KEY
// GitHub secret via tsdown.config.ts define. This mirrors how the Sentry
// DSN is baked into the published package.
const honeycombApiKey =
	typeof __HONEYCOMB_API_KEY__ === "string" && __HONEYCOMB_API_KEY__
		? __HONEYCOMB_API_KEY__
		: (process.env.HONEYCOMB_API_KEY ?? "");

const HONEYCOMB_ENDPOINT = "https://api.honeycomb.io/v1";
const HONEYCOMB_DATASET = "hevy-mcp";

const sentryRelease = process.env.SENTRY_RELEASE ?? `${name}@${version}`;

const resource = resourceFromAttributes({
	"service.name": name,
	"service.version": version,
});

// --- Sentry (error monitoring + traces) ---
const sentryClient = Sentry.init({
	dsn: "***********************************************************************************************",
	release: sentryRelease,
	tracesSampleRate: 1.0,
	sendDefaultPii: false,
	skipOpenTelemetrySetup: true,
	registerEsmLoaderHooks: false,
	ignoreErrors: ["EPIPE", "broken pipe"],
});

// --- OpenTelemetry tracer provider (dual export) ---
const spanProcessors: SpanProcessor[] = [new SentrySpanProcessor()];

// Span processor 2: Honeycomb (traces) — only if API key is available
if (honeycombApiKey) {
	spanProcessors.push(
		new BatchSpanProcessor(
			new OTLPTraceExporter({
				url: `${HONEYCOMB_ENDPOINT}/traces`,
				headers: {
					"x-honeycomb-team": honeycombApiKey,
					"x-honeycomb-dataset": HONEYCOMB_DATASET,
				},
			}),
		),
	);
}

const tracerProvider = new NodeTracerProvider({
	resource,
	sampler: sentryClient ? new SentrySampler(sentryClient) : undefined,
	spanProcessors,
});

tracerProvider.register({
	propagator: new SentryPropagator(),
	contextManager: new Sentry.SentryContextManager(),
});

// --- OpenTelemetry meter provider (Honeycomb metrics) ---
if (honeycombApiKey) {
	const meterProvider = new MeterProvider({
		resource,
		readers: [
			new PeriodicExportingMetricReader({
				exporter: new OTLPMetricExporter({
					url: `${HONEYCOMB_ENDPOINT}/metrics`,
					headers: {
						"x-honeycomb-team": honeycombApiKey,
						"x-honeycomb-dataset": HONEYCOMB_DATASET,
					},
				}),
				exportIntervalMillis: 10_000,
			}),
		],
	});
	metrics.setGlobalMeterProvider(meterProvider);
}

trace.setGlobalTracerProvider(tracerProvider);

// Validate that Sentry + OpenTelemetry are wired correctly
Sentry.validateOpenTelemetrySetup();

// --- Shared instances for the rest of the codebase ---
export const tracer = trace.getTracer(name);
export const meter = metrics.getMeter(name);
export { Sentry };
export { name as serviceName, version as serviceVersion };
