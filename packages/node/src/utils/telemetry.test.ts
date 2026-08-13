import type { Scope } from "@sentry/core";
import type { SpanOptions } from "@opentelemetry/api";
import type { MeterProviderOptions } from "@opentelemetry/sdk-metrics";
import type { TracerConfig } from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const objectSchema = z.object({}).passthrough();
const functionSchema = z.function();
const originalEnv = { ...process.env };
type ScopeDouble = Pick<Scope, "setTag" | "setContext" | "setFingerprint">;

const testDoubles = vi.hoisted(() => ({
	activeSpan: {
		addEvent: vi.fn(),
		recordException: vi.fn(),
		setAttribute: vi.fn(),
		setAttributes: vi.fn(),
		setStatus: vi.fn(),
		spanContext: vi.fn(() => ({ traceId: "trace-id", spanId: "span-id" })),
		end: vi.fn(),
	},
	sentryInit: vi.fn(() => ({ _isSentryClient: true })),
	sentryFlush: vi.fn().mockResolvedValue(true),
	sentrySetTag: vi.fn(),
	sentrySetContext: vi.fn(),
	sentrySetFingerprint: vi.fn(),
	sentryCaptureException: vi.fn(() => "event-id"),
	register: vi.fn(),
	setGlobalTracerProvider: vi.fn(),
	setGlobalMeterProvider: vi.fn(),
	otlpTraceExporter: vi.fn(),
	otlpMetricExporter: vi.fn(),
	batchSpanProcessor: vi.fn(),
	alwaysOnSampler: vi.fn(),
	meterProvider: vi.fn(),
	meterProviderOptions: undefined as MeterProviderOptions | undefined,
	meterProviderForceFlush: vi.fn(() => Promise.resolve()),
	periodicExportingMetricReader: vi.fn(),
	nodeTracerProvider: vi.fn(),
	tracerProviderForceFlush: vi.fn(() => Promise.resolve()),
	nodeTracerProviderOptions: undefined as TracerConfig | undefined,
}));

vi.mock("@sentry/node", () => ({
	init: testDoubles.sentryInit,
	flush: testDoubles.sentryFlush,
	withScope: vi.fn((callback: (scope: ScopeDouble) => unknown) =>
		callback({
			setTag: testDoubles.sentrySetTag,
			setContext: testDoubles.sentrySetContext,
			setFingerprint: testDoubles.sentrySetFingerprint,
		}),
	),
	captureException: testDoubles.sentryCaptureException,
}));

vi.mock("node:crypto", () => ({
	randomBytes: vi.fn(() => Buffer.alloc(16, 0xab)),
	randomUUID: vi.fn(() => "instance-id"),
}));

vi.mock("@opentelemetry/api", () => ({
	SpanStatusCode: { ERROR: 2 },
	trace: {
		getActiveSpan: vi.fn(() => testDoubles.activeSpan),
		getTracer: vi.fn(() => ({
			startActiveSpan: vi.fn(
				(
					_name: string,
					_options: SpanOptions,
					callback: (span: typeof testDoubles.activeSpan) => unknown,
				) => callback(testDoubles.activeSpan),
			),
		})),
		setGlobalTracerProvider: testDoubles.setGlobalTracerProvider,
	},
	metrics: {
		getMeter: vi.fn(() => ({
			createCounter: vi.fn(() => ({ add: vi.fn() })),
			createHistogram: vi.fn(() => ({ record: vi.fn() })),
		})),
		setGlobalMeterProvider: testDoubles.setGlobalMeterProvider,
	},
}));

vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
	OTLPTraceExporter: testDoubles.otlpTraceExporter,
}));

vi.mock("@opentelemetry/exporter-metrics-otlp-http", () => ({
	OTLPMetricExporter: testDoubles.otlpMetricExporter,
	AggregationTemporalityPreference: { DELTA: 0 },
}));

vi.mock("@opentelemetry/resources", () => ({
	resourceFromAttributes: vi.fn((attributes) => ({ attributes })),
}));

vi.mock("@opentelemetry/sdk-trace-base", () => ({
	BatchSpanProcessor: testDoubles.batchSpanProcessor,
	AlwaysOnSampler: testDoubles.alwaysOnSampler,
}));

vi.mock("@opentelemetry/sdk-trace-node", () => {
	class MockNodeTracerProvider {
		constructor(options: TracerConfig) {
			testDoubles.nodeTracerProvider(options);
			testDoubles.nodeTracerProviderOptions = options;
		}
		register = testDoubles.register;
		forceFlush() {
			return testDoubles.tracerProviderForceFlush();
		}
	}
	return { NodeTracerProvider: MockNodeTracerProvider };
});

vi.mock("@opentelemetry/sdk-metrics", () => {
	class MockMeterProvider {
		constructor(options: MeterProviderOptions) {
			testDoubles.meterProvider(options);
			testDoubles.meterProviderOptions = options;
		}
		forceFlush() {
			return testDoubles.meterProviderForceFlush();
		}
	}
	return {
		MeterProvider: MockMeterProvider,
		PeriodicExportingMetricReader: testDoubles.periodicExportingMetricReader,
	};
});

function setTelemetryEnvironment(
	telemetrySetting?: string,
	overrides: Record<string, string> = {},
): void {
	const env = { ...originalEnv };
	delete env.HEVY_MCP_TELEMETRY;
	delete env.HEVY_MCP_TELEMETRY_DIAGNOSTICS;
	delete env.SENTRY_DSN;
	delete env.SENTRY_RELEASE;
	delete env.OTEL_COLLECTOR_TOKEN;
	if (telemetrySetting !== undefined) {
		env.HEVY_MCP_TELEMETRY = telemetrySetting;
	}
	Object.assign(env, overrides);
	process.env = env;
}

describe("telemetry initialization", () => {
	beforeEach(() => {
		setTelemetryEnvironment();
		testDoubles.nodeTracerProviderOptions = undefined;
		testDoubles.meterProviderOptions = undefined;
	});
	afterEach(() => {
		process.env = { ...originalEnv };
		testDoubles.nodeTracerProviderOptions = undefined;
		testDoubles.meterProviderOptions = undefined;
		vi.clearAllMocks();
	});

	it("initializes Sentry independently from OTel tracing", async () => {
		vi.resetModules();
		await import("./telemetry.js");

		expect(testDoubles.sentryInit).toHaveBeenCalledWith(
			expect.objectContaining({
				sendDefaultPii: false,
				release: "hevy-mcp@dev",
				dsn: "https://ce696d8333b507acbf5203eb877bce0f@o4508975499575296.ingest.de.sentry.io/4509049671647312",
				tracesSampleRate: 0.0,
				sendClientReports: false,
				skipOpenTelemetrySetup: true,
				registerEsmLoaderHooks: false,
				ignoreErrors: ["EPIPE", "broken pipe"],
				beforeSend: expect.any(Function),
				integrations: expect.any(Function),
			}),
		);
	});

	it("uses an explicitly configured Sentry DSN", async () => {
		setTelemetryEnvironment(undefined, {
			SENTRY_DSN: "https://public-key@example.test/1",
			SENTRY_RELEASE: "hevy-mcp@test-release",
		});
		vi.resetModules();

		await import("./telemetry.js");

		expect(testDoubles.sentryInit).toHaveBeenCalledWith(
			expect.objectContaining({
				dsn: "https://public-key@example.test/1",
				release: "hevy-mcp@test-release",
			}),
		);
	});

	it("removes Sentry process handlers to prevent duplicate failures", async () => {
		vi.resetModules();
		await import("./telemetry.js");

		const firstCall = testDoubles.sentryInit.mock.calls[0] as
			| unknown[]
			| undefined;
		const options = firstCall?.[0] as
			| {
					integrations?: (
						integrations: Array<{ name: string }>,
					) => Array<{ name: string }>;
			  }
			| undefined;
		if (!options) throw new Error("Sentry options were not initialized");
		expect(
			options.integrations?.([
				{ name: "OnUncaughtException" },
				{ name: "OnUnhandledRejection" },
				{ name: "Http" },
			]),
		).toEqual([{ name: "Http" }]);
	});

	it.each<[string, string | undefined]>([
		["unset", undefined],
		["empty", ""],
		["one", "1"],
		["false", "false"],
	])("keeps telemetry enabled for $0", async (_label, setting) => {
		setTelemetryEnvironment(setting);
		vi.resetModules();

		await import("./telemetry.js");

		expect(testDoubles.sentryInit).toHaveBeenCalledOnce();
		expect(testDoubles.nodeTracerProvider).toHaveBeenCalledOnce();
		expect(testDoubles.alwaysOnSampler).toHaveBeenCalledOnce();
		expect(testDoubles.setGlobalTracerProvider).toHaveBeenCalledOnce();
	});

	it("uses an independent OTel sampler without Sentry tracing setup", async () => {
		vi.resetModules();
		await import("./telemetry.js");

		expect(testDoubles.alwaysOnSampler).toHaveBeenCalledOnce();
		expect(testDoubles.register).toHaveBeenCalledWith();

		const tracerOptions = testDoubles.nodeTracerProviderOptions as {
			sampler: unknown;
			spanProcessors: Array<unknown>;
		};
		expect(tracerOptions.sampler).toBeDefined();
		expect(tracerOptions.spanProcessors).toHaveLength(0);
	});

	it("records process failures with native exception diagnostics", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");
		const listeners = new Map<string, (error: Error | string) => void>();
		const processLike = {
			on: vi.fn((event: string, listener: (error: Error | string) => void) => {
				listeners.set(event, listener);
			}),
			removeListener: vi.fn(
				(event: string, listener: (error: Error | string) => void) => {
					expect(listeners.get(event)).toBe(listener);
				},
			),
		};

		const cleanup = mod.installProcessExceptionTracking(processLike);
		const uncaught = Object.assign(new Error("uncaught"), {
			code: "ECONNREFUSED",
		});
		listeners.get("uncaughtExceptionMonitor")?.(uncaught);
		listeners.get("unhandledRejection")?.("rejection-secret");
		cleanup();
		cleanup();

		expect(testDoubles.activeSpan.recordException).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ name: "Error", message: "uncaught" }),
		);
		expect(testDoubles.activeSpan.recordException).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ name: "UnknownError" }),
		);
		expect(
			JSON.stringify(testDoubles.activeSpan.recordException.mock.calls[1]),
		).not.toContain("rejection-secret");
		expect(testDoubles.activeSpan.addEvent).not.toHaveBeenCalledWith(
			"exception",
			expect.anything(),
		);
		expect(testDoubles.sentryCaptureException).toHaveBeenCalledTimes(2);
		expect(testDoubles.activeSpan.end).toHaveBeenCalledTimes(2);
		expect(processLike.removeListener).toHaveBeenCalledTimes(2);
	});

	it("registers the global tracer provider", async () => {
		vi.resetModules();
		await import("./telemetry.js");

		expect(testDoubles.setGlobalTracerProvider).toHaveBeenCalled();
	});

	it("configures collector exporters when a token is present", async () => {
		vi.resetModules();
		setTelemetryEnvironment(undefined, {
			OTEL_COLLECTOR_TOKEN: "test-collector-token",
		});

		const mod = await import("./telemetry.js");

		expect(testDoubles.otlpTraceExporter).toHaveBeenCalledWith({
			url: "https://otel.chrisdoc.dev/v1/traces",
			headers: {
				Authorization: "Bearer test-collector-token",
			},
		});
		expect(testDoubles.batchSpanProcessor).toHaveBeenCalledTimes(1);
		expect(testDoubles.otlpMetricExporter).toHaveBeenCalledWith({
			url: "https://otel.chrisdoc.dev/v1/metrics",
			headers: {
				Authorization: "Bearer test-collector-token",
			},
			temporalityPreference: 0,
		});
		expect(testDoubles.periodicExportingMetricReader).toHaveBeenCalledWith(
			expect.objectContaining({
				exportIntervalMillis: 30_000,
			}),
		);
		const tracerOptions = testDoubles.nodeTracerProviderOptions as {
			spanProcessors: Array<unknown>;
		};
		expect(tracerOptions.spanProcessors).toHaveLength(1);

		await mod.flushTelemetry();
		expect(testDoubles.tracerProviderForceFlush).toHaveBeenCalledOnce();
		expect(testDoubles.meterProviderForceFlush).toHaveBeenCalledOnce();
		expect(testDoubles.sentryFlush).toHaveBeenCalledWith(1_000);
	});

	it("keeps collector exports when Sentry DSN is empty", async () => {
		setTelemetryEnvironment(undefined, {
			SENTRY_DSN: "",
			OTEL_COLLECTOR_TOKEN: "test-collector-token",
		});
		vi.resetModules();

		await import("./telemetry.js");

		expect(testDoubles.sentryInit).toHaveBeenCalledWith(
			expect.objectContaining({ dsn: undefined }),
		);
		expect(testDoubles.otlpTraceExporter).toHaveBeenCalledOnce();
		expect(testDoubles.otlpMetricExporter).toHaveBeenCalledOnce();
	});

	it("disables the complete telemetry graph for the exact opt-out value", async () => {
		setTelemetryEnvironment("0", {
			SENTRY_DSN: "sentry-sentinel",
			OTEL_COLLECTOR_TOKEN: "collector-sentinel",
		});
		vi.resetModules();

		const mod = await import("./telemetry.js");

		expect(testDoubles.sentryInit).not.toHaveBeenCalled();
		expect(testDoubles.nodeTracerProvider).not.toHaveBeenCalled();
		expect(testDoubles.otlpTraceExporter).not.toHaveBeenCalled();
		expect(testDoubles.otlpMetricExporter).not.toHaveBeenCalled();
		expect(testDoubles.setGlobalTracerProvider).not.toHaveBeenCalled();
		expect(testDoubles.setGlobalMeterProvider).not.toHaveBeenCalled();
		expect(objectSchema.safeParse(mod.tracer).success).toBe(true);
		expect(objectSchema.safeParse(mod.meter).success).toBe(true);
		expect(functionSchema.safeParse(mod.flushTelemetry).success).toBe(true);

		await mod.flushTelemetry();
		expect(testDoubles.tracerProviderForceFlush).not.toHaveBeenCalled();
		expect(testDoubles.meterProviderForceFlush).not.toHaveBeenCalled();
		expect(testDoubles.sentryFlush).not.toHaveBeenCalled();
	});

	it("exports shared telemetry instances", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");
		expect(mod.tracer).toBeDefined();
		expect(mod.meter).toBeDefined();
		expect(mod.captureFailure).toBeDefined();
		expect(mod.serviceName).toBe("hevy-mcp");
		expect(mod.serviceVersion).toBe("dev");
	});

	it("passes through valid service-instance IDs from provider", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");
		expect(mod.createServiceInstanceId(() => "process-one")).toBe(
			"process-one",
		);
		expect(mod.createServiceInstanceId(() => "process-two")).toBe(
			"process-two",
		);
		expect(mod.serviceInstanceId).toBe("instance-id");
	});

	it("falls back to a random opaque ID for invalid generators", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");
		const fallback = "ab".repeat(16);

		expect(mod.createServiceInstanceId(() => "")).toBe(fallback);
		expect(mod.createServiceInstanceId(() => "x".repeat(129))).toBe(fallback);
		expect(
			mod.createServiceInstanceId(() => {
				throw new Error("entropy unavailable");
			}),
		).toBe(fallback);
	});
});
