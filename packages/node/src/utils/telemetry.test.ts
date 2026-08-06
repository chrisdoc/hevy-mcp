import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HevyHttpError } from "@hevy-mcp/hevy-client";

const originalEnv = { ...process.env };

// The telemetry module initializes Sentry and OTel at import time.
// We mock the external dependencies so the test can verify initialization
// without making real network calls.

const testDoubles = vi.hoisted(() => {
	return {
		activeSpan: {
			addEvent: vi.fn(),
			recordException: vi.fn(),
			setAttribute: vi.fn(),
			setAttributes: vi.fn(),
			setStatus: vi.fn(),
			end: vi.fn(),
		},
		sentryInit: vi.fn(() => ({ _isSentryClient: true })),
		sentryFlush: vi.fn().mockResolvedValue(true),
		sentrySetTag: vi.fn(),
		sentrySetContext: vi.fn(),
		sentrySetFingerprint: vi.fn(),
		sentryCaptureMessage: vi.fn(),
		sentryCaptureException: vi.fn(),
		validateOpenTelemetrySetup: vi.fn(),
		sentrySpanProcessor: vi.fn(),
		sentryPropagator: vi.fn(),
		sentrySampler: vi.fn(),
		sentryContextManager: vi.fn(),
		register: vi.fn(),
		setGlobalTracerProvider: vi.fn(),
		setGlobalMeterProvider: vi.fn(),
		otlpTraceExporter: vi.fn(),
		otlpMetricExporter: vi.fn(),
		batchSpanProcessor: vi.fn(),
		alwaysOnSampler: vi.fn(),
		meterProvider: vi.fn(),
		meterProviderOptions: undefined as unknown,
		meterProviderForceFlush: vi.fn().mockResolvedValue(undefined),
		periodicExportingMetricReader: vi.fn(),
		nodeTracerProvider: vi.fn(),
		tracerProviderForceFlush: vi.fn().mockResolvedValue(undefined),
		nodeTracerProviderOptions: undefined as unknown,
		metricAdd: vi.fn(),
		metricRecord: vi.fn(),
	};
});
vi.mock("@sentry/node", () => ({
	init: testDoubles.sentryInit,
	flush: testDoubles.sentryFlush,
	withScope: vi.fn((callback: (scope: unknown) => void) =>
		callback({
			setTag: testDoubles.sentrySetTag,
			setContext: testDoubles.sentrySetContext,
			setFingerprint: testDoubles.sentrySetFingerprint,
		}),
	),
	captureMessage: testDoubles.sentryCaptureMessage,
	captureException: testDoubles.sentryCaptureException,
	validateOpenTelemetrySetup: testDoubles.validateOpenTelemetrySetup,
	SentryContextManager: testDoubles.sentryContextManager,
}));

vi.mock("node:crypto", () => ({
	randomBytes: vi.fn(() => Buffer.alloc(16, 0xab)),
	randomUUID: vi.fn(() => "instance-id"),
}));
vi.mock("@sentry/opentelemetry", () => ({
	SentrySpanProcessor: testDoubles.sentrySpanProcessor,
	SentryPropagator: testDoubles.sentryPropagator,
	SentrySampler: testDoubles.sentrySampler,
}));

vi.mock("@opentelemetry/api", () => ({
	SpanStatusCode: { ERROR: 2 },
	trace: {
		getActiveSpan: vi.fn(() => testDoubles.activeSpan),
		getTracer: vi.fn(() => ({
			startActiveSpan: vi.fn(
				(
					_name: string,
					_options: unknown,
					callback: (span: typeof testDoubles.activeSpan) => unknown,
				) => callback(testDoubles.activeSpan),
			),
		})),
		setGlobalTracerProvider: testDoubles.setGlobalTracerProvider,
	},
	metrics: {
		getMeter: vi.fn(() => ({
			createCounter: vi.fn(() => ({ add: testDoubles.metricAdd })),
			createHistogram: vi.fn(() => ({ record: testDoubles.metricRecord })),
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
		constructor(options: unknown) {
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
		constructor(options: unknown) {
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
	delete env.SENTRY_DSN;
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

	it("initializes Sentry with skipOpenTelemetrySetup", async () => {
		vi.resetModules();
		await import("./telemetry.js");

		expect(testDoubles.sentryInit).toHaveBeenCalledWith(
			expect.objectContaining({
				sendDefaultPii: false,
				dsn: "https://7c08d2c880ff4560a333dff4833594cd@glitchtip.chrisdoc.dev/1",
				tracesSampleRate: 0.0,
				sendClientReports: false,
				skipOpenTelemetrySetup: true,
				registerEsmLoaderHooks: false,
				ignoreErrors: ["EPIPE", "broken pipe"],
			}),
		);
	});

	it("uses an explicitly configured Sentry DSN", async () => {
		setTelemetryEnvironment(undefined, {
			SENTRY_DSN: "https://public-key@example.test/1",
		});
		vi.resetModules();

		await import("./telemetry.js");

		expect(testDoubles.sentryInit).toHaveBeenCalledWith(
			expect.objectContaining({
				dsn: "https://public-key@example.test/1",
			}),
		);
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
		expect(testDoubles.sentrySpanProcessor).not.toHaveBeenCalled();
		expect(testDoubles.sentrySampler).not.toHaveBeenCalled();
		expect(testDoubles.sentryPropagator).not.toHaveBeenCalled();
		expect(testDoubles.sentryContextManager).not.toHaveBeenCalled();
		expect(testDoubles.setGlobalTracerProvider).toHaveBeenCalledOnce();
		expect(testDoubles.validateOpenTelemetrySetup).not.toHaveBeenCalled();
	});

	it("uses an independent OTel sampler without Sentry tracing setup", async () => {
		vi.resetModules();
		await import("./telemetry.js");

		expect(testDoubles.alwaysOnSampler).toHaveBeenCalledOnce();
		expect(testDoubles.sentrySampler).not.toHaveBeenCalled();
		expect(testDoubles.sentrySpanProcessor).not.toHaveBeenCalled();
		expect(testDoubles.sentryPropagator).not.toHaveBeenCalled();
		expect(testDoubles.sentryContextManager).not.toHaveBeenCalled();
		expect(testDoubles.validateOpenTelemetrySetup).not.toHaveBeenCalled();
		expect(testDoubles.register).toHaveBeenCalledWith();

		const tracerOptions = testDoubles.nodeTracerProviderOptions as {
			sampler: unknown;
			spanProcessors: Array<unknown>;
		};
		expect(tracerOptions.sampler).toBeDefined();
		expect(tracerOptions.spanProcessors).toHaveLength(0);
	});
	it("records uncaught exceptions and unhandled rejections safely", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");
		const listeners = new Map<string, (error: unknown) => void>();
		const processLike = {
			on: vi.fn((event: string, listener: (error: unknown) => void) => {
				listeners.set(event, listener);
			}),
			removeListener: vi.fn(
				(event: string, listener: (error: unknown) => void) => {
					expect(listeners.get(event)).toBe(listener);
				},
			),
		};

		const cleanup = mod.installProcessExceptionTracking(processLike);
		const uncaughtError = Object.assign(new Error("uncaught"), {
			code: "ECONNREFUSED",
		});
		const rejection = "rejection-secret";
		listeners.get("uncaughtExceptionMonitor")?.(uncaughtError);
		listeners.get("unhandledRejection")?.(rejection);
		cleanup();
		cleanup();

		expect(testDoubles.activeSpan.recordException).toHaveBeenNthCalledWith(
			1,
			uncaughtError,
		);
		expect(testDoubles.activeSpan.recordException).toHaveBeenNthCalledWith(
			2,
			rejection,
		);
		expect(testDoubles.activeSpan.addEvent).not.toHaveBeenCalledWith(
			"exception",
			expect.anything(),
		);
		expect(testDoubles.sentryCaptureMessage).toHaveBeenCalledWith(
			"MCP process uncaughtException failure",
			"error",
		);
		expect(testDoubles.sentrySetContext).not.toHaveBeenCalled();
		expect(testDoubles.activeSpan.setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				"exception.source": "uncaughtException",
				"mcp.failure.phase": "uncaught_exception",
				"error.type": "MCP_PROCESS_EXCEPTION",
				"error.category": "McpProcessFailure",
			}),
		);
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
				exporter: expect.anything(),
				exportIntervalMillis: 30_000,
			}),
		);
		expect(testDoubles.meterProvider).toHaveBeenCalledWith(
			expect.objectContaining({
				readers: expect.any(Array),
			}),
		);
		expect(testDoubles.setGlobalMeterProvider).toHaveBeenCalled();
		expect(testDoubles.sentryInit).toHaveBeenCalledWith(
			expect.objectContaining({
				sendDefaultPii: false,
				skipOpenTelemetrySetup: true,
				registerEsmLoaderHooks: false,
			}),
		);
		expect(testDoubles.nodeTracerProvider).toHaveBeenCalledWith(
			expect.objectContaining({
				resource: expect.anything(),
				sampler: expect.anything(),
				spanProcessors: expect.any(Array),
			}),
		);
		expect(testDoubles.alwaysOnSampler).toHaveBeenCalledOnce();
		expect(testDoubles.sentrySampler).not.toHaveBeenCalled();
		expect(testDoubles.sentrySpanProcessor).not.toHaveBeenCalled();
		expect(testDoubles.sentryPropagator).not.toHaveBeenCalled();
		expect(testDoubles.sentryContextManager).not.toHaveBeenCalled();
		expect(testDoubles.validateOpenTelemetrySetup).not.toHaveBeenCalled();
		const tracerOptions = testDoubles.nodeTracerProviderOptions as {
			resource: { attributes: Record<string, unknown> };
			sampler: unknown;
			spanProcessors: Array<unknown>;
		};
		expect(tracerOptions.sampler).toBeDefined();
		expect(tracerOptions.spanProcessors).toHaveLength(1);
		const meterOptions = testDoubles.meterProviderOptions as {
			resource: { attributes: Record<string, unknown> };
		};
		expect(meterOptions.resource).toBe(tracerOptions.resource);
		expect(meterOptions.resource.attributes).toMatchObject({
			"service.name": "hevy-mcp",
			"service.version": "dev",
			"service.instance.id": "instance-id",
		});
		expect(testDoubles.setGlobalTracerProvider).toHaveBeenCalledOnce();

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
		expect(testDoubles.periodicExportingMetricReader).toHaveBeenCalledOnce();
	});

	it("disables the complete telemetry graph for the exact opt-out value", async () => {
		setTelemetryEnvironment("0", {
			SENTRY_DSN: "sentry-sentinel",
			OTEL_COLLECTOR_TOKEN: "collector-sentinel",
		});
		vi.resetModules();

		const mod = await import("./telemetry.js");

		expect(testDoubles.sentryInit).not.toHaveBeenCalled();
		expect(testDoubles.sentrySpanProcessor).not.toHaveBeenCalled();
		expect(testDoubles.sentrySampler).not.toHaveBeenCalled();
		expect(testDoubles.sentryPropagator).not.toHaveBeenCalled();
		expect(testDoubles.sentryContextManager).not.toHaveBeenCalled();
		expect(testDoubles.nodeTracerProvider).not.toHaveBeenCalled();
		expect(testDoubles.otlpTraceExporter).not.toHaveBeenCalled();
		expect(testDoubles.batchSpanProcessor).not.toHaveBeenCalled();
		expect(testDoubles.otlpMetricExporter).not.toHaveBeenCalled();
		expect(testDoubles.periodicExportingMetricReader).not.toHaveBeenCalled();
		expect(testDoubles.meterProvider).not.toHaveBeenCalled();
		expect(testDoubles.setGlobalTracerProvider).not.toHaveBeenCalled();
		expect(testDoubles.setGlobalMeterProvider).not.toHaveBeenCalled();
		expect(testDoubles.validateOpenTelemetrySetup).not.toHaveBeenCalled();
		expect(testDoubles.alwaysOnSampler).not.toHaveBeenCalled();
		expect(testDoubles.nodeTracerProviderOptions).toBeUndefined();
		expect(typeof mod.tracer).toBe("object");
		expect(typeof mod.meter).toBe("object");
		expect(typeof mod.flushTelemetry).toBe("function");

		await mod.flushTelemetry();

		expect(testDoubles.tracerProviderForceFlush).not.toHaveBeenCalled();
		expect(testDoubles.meterProviderForceFlush).not.toHaveBeenCalled();
		expect(testDoubles.sentryFlush).not.toHaveBeenCalled();
	});

	it("exports tracer, meter, Sentry, serviceName, and serviceVersion", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");
		expect(mod.tracer).toBeDefined();
		expect(mod.meter).toBeDefined();
		expect(mod.Sentry).toBeDefined();
		expect(mod.serviceName).toBe("hevy-mcp");
		expect(mod.serviceVersion).toBe("dev");
	});

	it("keeps service-instance IDs stable per provider and isolated between providers", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");
		const first = mod.createServiceInstanceId(() => "process-one");
		const second = mod.createServiceInstanceId(() => "process-two");

		expect(first).toBe("process-one");
		expect(mod.createServiceInstanceId(() => first)).toBe(first);
		expect(second).toBe("process-two");
		expect(second).not.toBe(first);
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
	it("does not emit an API-key-derived user hash", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");

		const providerOptions = testDoubles.nodeTracerProviderOptions as {
			spanProcessors: Array<unknown>;
		};
		expect(providerOptions.spanProcessors).toHaveLength(0);
		expect(testDoubles.activeSpan.setAttribute).not.toHaveBeenCalledWith(
			"user.hash",
			expect.anything(),
		);
		expect("setTelemetryUser" in mod).toBe(false);
	});

	it("records native OTel exception semantics without span detail copies", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");
		const secret = "secret-exception-message";
		const path = "/home/private/hevy-mcp/packages/node/src/index.ts";
		const error = new Error(secret);
		error.stack = `Error: ${secret}\n    at main (${path}:10:2)`;
		Object.assign(error, {
			authorization: "bearer-secret",
			body: "response-body-secret",
		});

		mod.recordTelemetryException(error, {
			"mcp.failure.phase": "run",
			"error.type": "MCP_SERVER_RUN_ERROR",
			"error.category": "McpServerRunFailure",
		});

		expect(testDoubles.activeSpan.recordException).toHaveBeenCalledWith(error);
		expect(testDoubles.activeSpan.addEvent).not.toHaveBeenCalledWith(
			"exception",
			expect.anything(),
		);
		expect(testDoubles.activeSpan.setAttributes).toHaveBeenCalledWith({
			"mcp.failure.phase": "run",
			"error.type": "MCP_SERVER_RUN_ERROR",
			"error.category": "McpServerRunFailure",
		});
		expect(testDoubles.activeSpan.setAttribute).not.toHaveBeenCalledWith(
			"exception.message",
			expect.anything(),
		);
		expect(testDoubles.activeSpan.setAttribute).not.toHaveBeenCalledWith(
			"exception.stacktrace",
			expect.anything(),
		);
		expect(testDoubles.activeSpan.setStatus).toHaveBeenCalledWith({ code: 2 });
		expect(testDoubles.metricAdd).not.toHaveBeenCalled();
		expect(testDoubles.metricRecord).not.toHaveBeenCalled();
	});

	it("reports a generic Sentry event without passing the native error", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");
		const error = new TypeError("invalid runtime state");
		error.stack =
			"TypeError: invalid runtime state\n    at run (/app/index.ts:4:2)";
		const attributes = {
			"mcp.failure.phase": "uncaught_exception",
			"error.type": "MCP_PROCESS_EXCEPTION",
			"error.category": "McpProcessFailure",
		};

		mod.recordSentryTelemetryException(
			"MCP process uncaughtException failure",
			error,
			attributes,
		);

		expect(testDoubles.sentryCaptureMessage).toHaveBeenCalledWith(
			"MCP process uncaughtException failure",
			"error",
		);
		expect(testDoubles.sentrySetTag).toHaveBeenCalledWith(
			"error.type",
			"MCP_PROCESS_EXCEPTION",
		);
		expect(testDoubles.sentrySetContext).not.toHaveBeenCalled();
		expect(testDoubles.sentryCaptureException).not.toHaveBeenCalled();
	});

	it("swallows OTel recording failures", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");
		testDoubles.activeSpan.recordException.mockImplementationOnce(() => {
			throw new Error("telemetry failure");
		});

		expect(() =>
			mod.recordTelemetryException(new Error("application failure")),
		).not.toThrow();
	});

	it("passes native Hevy errors to OTel without custom Sentry capture", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");
		const error = new HevyHttpError("Hevy request failed", {
			status: 422,
			method: "POST",
			endpoint: "/v1/workouts",
			data: { secret: "response-body-secret" },
			headers: new Headers({ authorization: "Bearer api-key-secret" }),
			cause: new Error("nested-secret"),
		});

		mod.recordTelemetryException(error);

		expect(testDoubles.activeSpan.recordException).toHaveBeenCalledWith(error);
		expect(testDoubles.sentryCaptureException).not.toHaveBeenCalled();
	});

	it("does not send raw exception details to metric instruments", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");
		const error = new Error("metric-message-secret");

		mod.recordTelemetryException(error, {
			"error.type": "MCP_SERVER_RUN_ERROR",
			"error.category": "McpServerRunFailure",
		});

		expect(testDoubles.metricAdd).not.toHaveBeenCalled();
		expect(testDoubles.metricRecord).not.toHaveBeenCalled();
	});

	it("does not call Sentry with native exception data", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");
		const error = new Error("sentry-message-secret");
		Object.assign(error, { headers: { authorization: "api-key-secret" } });

		mod.recordSentryTelemetryException("MCP failure", error, {
			"error.type": "MCP_SERVER_RUN_ERROR",
			"error.category": "McpServerRunFailure",
		});

		expect(testDoubles.sentryCaptureException).not.toHaveBeenCalled();
		expect(testDoubles.sentrySetContext).not.toHaveBeenCalled();
		expect(testDoubles.sentryCaptureMessage).toHaveBeenCalledWith(
			"MCP failure",
			"error",
		);
	});
});
