import { describe, expect, it, vi } from "vitest";

// The telemetry module initializes Sentry and OTel at import time.
// We mock the external dependencies so the test can verify initialization
// without making real network calls.

const testDoubles = vi.hoisted(() => ({
	sentryInit: vi.fn(() => ({ _isSentryClient: true })),
	validateOpenTelemetrySetup: vi.fn(),
	addSpanProcessor: vi.fn(),
	register: vi.fn(),
	setGlobalTracerProvider: vi.fn(),
	setGlobalMeterProvider: vi.fn(),
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
	OTLPTraceExporter: vi.fn(),
}));

vi.mock("@opentelemetry/exporter-metrics-otlp-http", () => ({
	OTLPMetricExporter: vi.fn(),
}));

vi.mock("@opentelemetry/resources", () => ({
	resourceFromAttributes: vi.fn(() => ({})),
}));

vi.mock("@opentelemetry/sdk-trace-base", () => ({
	BatchSpanProcessor: vi.fn(),
}));

vi.mock("@opentelemetry/sdk-trace-node", () => {
	class MockNodeTracerProvider {
		addSpanProcessor = testDoubles.addSpanProcessor;
		register = testDoubles.register;
	}
	return { NodeTracerProvider: MockNodeTracerProvider };
});

vi.mock("@opentelemetry/sdk-metrics", () => ({
	MeterProvider: vi.fn(),
	PeriodicExportingMetricReader: vi.fn(),
}));

describe("telemetry initialization", () => {
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

	it("exports tracer, meter, Sentry, serviceName, and serviceVersion", async () => {
		vi.resetModules();
		const mod = await import("./telemetry.js");
		expect(mod.tracer).toBeDefined();
		expect(mod.meter).toBeDefined();
		expect(mod.Sentry).toBeDefined();
		expect(mod.serviceName).toBe("hevy-mcp");
		expect(mod.serviceVersion).toBe("dev");
	});
});
