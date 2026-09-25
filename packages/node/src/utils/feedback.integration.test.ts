import {
	InMemorySpanExporter,
	SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { describe, expect, it, vi } from "vitest";

describe("Node feedback recorder telemetry integration", () => {
	it("exports a privacy-safe detached feedback span", async () => {
		const exporter = new InMemorySpanExporter();
		const provider = new NodeTracerProvider({
			spanProcessors: [new SimpleSpanProcessor(exporter)],
		});
		const tracer = provider.getTracer("feedback-integration-test");

		vi.doMock("./telemetry.js", () => ({
			getTelemetryAvailability: () => "available",
			tracer,
		}));

		try {
			const { createNodeFeedbackRecorder } = await import("./feedback.js");
			const result = createNodeFeedbackRecorder().record(
				"Technical issue from jane@example.com",
			);

			expect(result).toEqual({ accepted: true });
			const [span] = exporter.getFinishedSpans();
			expect(span).toBeDefined();
			if (!span) throw new Error("Expected feedback span to be exported");

			expect(span.name).toBe("hevy_mcp.feedback");
			expect(span.attributes).toEqual({
				"feedback.message": "Technical issue from [EMAIL_REDACTED]",
				"feedback.source": "agent",
			});
			expect(Object.keys(span.attributes)).not.toEqual(
				expect.arrayContaining([
					expect.stringMatching(/user|session|request|geo|baggage/iu),
				]),
			);
			expect(Object.keys(span.resource.attributes)).not.toEqual(
				expect.arrayContaining([
					expect.stringMatching(/user|session|request|geo|baggage/iu),
				]),
			);
		} finally {
			await provider.shutdown();
			vi.doUnmock("./telemetry.js");
			vi.resetModules();
		}
	});
});
