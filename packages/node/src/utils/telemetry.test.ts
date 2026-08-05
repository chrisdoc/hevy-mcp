import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

// The telemetry module initializes Sentry and OTel at import time.
// We mock the external dependencies so the test can verify initialization
// without making real network calls.

const testDoubles = vi.hoisted(() => {
	const hmacUpdate = vi.fn().mockReturnThis();
	const hmacDigest = vi.fn(() => "abcdef0123456789");

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
		sentrySetUser: vi.fn(),
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
		createHmac: vi.fn(() => ({
			update: hmacUpdate,
			digest: hmacDigest,
		})),
		hmacUpdate,
		hmacDigest,
	};
});
vi.mock("@sentry/node", () => ({
	init: testDoubles.sentryInit,
	flush: testDoubles.sentryFlush,
	setUser: testDoubles.sentrySetUser,
	validateOpenTelemetrySetup: testDoubles.validateOpenTelemetrySetup,
	SentryContextManager: testDoubles.sentryContextManager,
}));

vi.mock("node:crypto", () => ({
	createHmac: testDoubles.createHmac,
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
		expect(tracerOptions.spanProcessors).toHaveLength(1);
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
		listeners.get("uncaughtExceptionMonitor")?.(
			Object.assign(new Error("uncaught"), { code: "ECONNREFUSED" }),
		);
		listeners.get("unhandledRejection")?.("rejection-secret");
		cleanup();
		cleanup();

		expect(testDoubles.activeSpan.recordException).not.toHaveBeenCalled();
		expect(testDoubles.activeSpan.addEvent).toHaveBeenCalledTimes(2);
		expect(testDoubles.activeSpan.addEvent).toHaveBeenCalledWith(
			"exception",
			expect.objectContaining({
				"exception.type": "Error",
				"exception.source": "uncaughtException",
				"mcp.failure.phase": "uncaught_exception",
				"error.type": "MCP_PROCESS_EXCEPTION",
				"error.category": "McpProcessFailure",
				"error.code": "ECONNREFUSED",
			}),
		);
		expect(testDoubles.activeSpan.setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				"exception.source": "uncaughtException",
				"mcp.failure.phase": "uncaught_exception",
				"error.type": "MCP_PROCESS_EXCEPTION",
				"error.category": "McpProcessFailure",
				"error.code": "ECONNREFUSED",
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
		expect(tracerOptions.spanProcessors).toHaveLength(2);
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
		expect(typeof mod.setTelemetryUser).toBe("function");

		mod.setTelemetryUser("raw-api-key-sentinel");
		await mod.flushTelemetry();

		expect(testDoubles.createHmac).not.toHaveBeenCalled();
		expect(testDoubles.sentrySetUser).not.toHaveBeenCalled();
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
	it("derives and attaches a truncated HMAC user pseudonym", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");

		mod.setTelemetryUser("raw-api-key-sentinel");

		expect(testDoubles.createHmac).toHaveBeenCalledWith(
			"sha256",
			"raw-api-key-sentinel",
		);
		expect(testDoubles.hmacUpdate).toHaveBeenCalledWith(
			"hevy-mcp:sentry-user-id:v1",
		);
		expect(testDoubles.hmacDigest).toHaveBeenCalledWith("hex");
		expect(testDoubles.sentrySetUser).toHaveBeenCalledWith({
			id: "abcdef0123",
		});

		const providerOptions = testDoubles.nodeTracerProviderOptions as {
			spanProcessors: Array<{
				onStart: (span: unknown, parentContext: unknown) => void;
			}>;
		};
		const processor = providerOptions.spanProcessors[0];
		if (!processor) {
			throw new Error("Expected user hash span processor");
		}

		const setAttribute = vi.fn();
		processor.onStart({ setAttribute }, {});

		expect(setAttribute).toHaveBeenCalledWith("user.hash", "abcdef0123");
	});

	it("exports only bounded exception attributes", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");
		const secret = "secret-exception-message";
		const path = "/home/private/hevy-mcp/packages/node/src/index.ts";
		const error = new Error(secret);
		error.stack = `Error: ${secret}\n    at main (${path}:10:2)`;

		mod.recordTelemetryException(error, {
			"mcp.failure.phase": "run",
			"error.type": "MCP_SERVER_RUN_ERROR",
			"error.category": "McpServerRunFailure",
		});

		expect(testDoubles.activeSpan.recordException).not.toHaveBeenCalled();
		expect(testDoubles.activeSpan.addEvent).toHaveBeenCalledWith("exception", {
			"exception.type": "Error",
			"mcp.failure.phase": "run",
			"error.type": "MCP_SERVER_RUN_ERROR",
			"error.category": "McpServerRunFailure",
		});
		const exported = JSON.stringify({
			events: testDoubles.activeSpan.addEvent.mock.calls,
			attributes: testDoubles.activeSpan.setAttributes.mock.calls,
		});
		expect(exported).not.toContain(secret);
		expect(exported).not.toContain(path);
		expect(exported).not.toContain("exception.message");
		expect(exported).not.toContain("exception.stacktrace");
	});
});
