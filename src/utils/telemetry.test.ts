import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

// The telemetry module initializes Sentry and OTel at import time.
// We mock the external dependencies so the test can verify initialization
// without making real network calls.

const testDoubles = vi.hoisted(() => ({
	sentryInit: vi.fn(() => ({ _isSentryClient: true })),
	validateOpenTelemetrySetup: vi.fn(),
	register: vi.fn(),
	setGlobalTracerProvider: vi.fn(),
	setGlobalMeterProvider: vi.fn(),
	otlpTraceExporter: vi.fn(),
	otlpMetricExporter: vi.fn(),
	batchSpanProcessor: vi.fn(),
	meterProvider: vi.fn(),
	periodicExportingMetricReader: vi.fn(),
	nodeTracerProviderOptions: undefined as unknown,
}));

vi.mock("@sentry/node", () => ({
	init: testDoubles.sentryInit,
	validateOpenTelemetrySetup: testDoubles.validateOpenTelemetrySetup,
	SentryContextManager: vi.fn(),
}));

vi.mock("@sentry/opentelemetry", () => ({
	SentrySpanProcessor: vi.fn(),
	SentryPropagator: vi.fn(),
	SentrySampler: vi.fn(),
}));

vi.mock("@opentelemetry/api", () => ({
	trace: {
		getTracer: vi.fn(() => ({ startActiveSpan: vi.fn() })),
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
}));

vi.mock("@opentelemetry/resources", () => ({
	resourceFromAttributes: vi.fn(() => ({})),
}));

vi.mock("@opentelemetry/sdk-trace-base", () => ({
	BatchSpanProcessor: testDoubles.batchSpanProcessor,
}));

vi.mock("@opentelemetry/sdk-trace-node", () => {
	class MockNodeTracerProvider {
		constructor(options: unknown) {
			testDoubles.nodeTracerProviderOptions = options;
		}
		register = testDoubles.register;
	}
	return { NodeTracerProvider: MockNodeTracerProvider };
});

vi.mock("@opentelemetry/sdk-metrics", () => ({
	MeterProvider: testDoubles.meterProvider,
	PeriodicExportingMetricReader: testDoubles.periodicExportingMetricReader,
}));

describe("telemetry initialization", () => {
	afterEach(() => {
		process.env = { ...originalEnv };
		vi.clearAllMocks();
	});

	it("initializes Sentry with skipOpenTelemetrySetup", async () => {
		vi.resetModules();
		await import("./telemetry.js");

		expect(testDoubles.sentryInit).toHaveBeenCalledWith(
			expect.objectContaining({
				skipOpenTelemetrySetup: true,
				registerEsmLoaderHooks: false,
				ignoreErrors: ["EPIPE", "broken pipe"],
			}),
		);
	});

	it("validates OpenTelemetry setup", async () => {
		vi.resetModules();
		await import("./telemetry.js");

		expect(testDoubles.validateOpenTelemetrySetup).toHaveBeenCalled();
	});

	it("registers the global tracer provider", async () => {
		vi.resetModules();
		await import("./telemetry.js");

		expect(testDoubles.setGlobalTracerProvider).toHaveBeenCalled();
	});

	it("configures collector exporters when a token is present", async () => {
		vi.resetModules();
		process.env = {
			...originalEnv,
			OTEL_COLLECTOR_TOKEN: "test-collector-token",
		};

		await import("./telemetry.js");

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
		});
		expect(testDoubles.periodicExportingMetricReader).toHaveBeenCalledWith(
			expect.objectContaining({
				exporter: expect.anything(),
				exportIntervalMillis: 10_000,
			}),
		);
		expect(testDoubles.meterProvider).toHaveBeenCalledWith(
			expect.objectContaining({
				readers: expect.any(Array),
			}),
		);
		expect(testDoubles.setGlobalMeterProvider).toHaveBeenCalled();
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
	it("adds the current user hash to every started span", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");
		mod.setCurrentUserHash("hash-123");

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

		expect(setAttribute).toHaveBeenCalledWith("user.hash", "hash-123");
	});
});
