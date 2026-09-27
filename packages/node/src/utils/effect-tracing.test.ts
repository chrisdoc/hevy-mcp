import { Effect } from "effect";
import { trace } from "@opentelemetry/api";
import {
	InMemorySpanExporter,
	SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { describe, expect, it } from "vitest";
import { createEffectTracer, getActiveEffectParentSpan } from "./telemetry.js";

describe("Effect tracing bridge", () => {
	it("keeps Effect.fn spans under the active OpenTelemetry span", async () => {
		const exporter = new InMemorySpanExporter();
		const provider = new NodeTracerProvider({
			spanProcessors: [new SimpleSpanProcessor(exporter)],
		});
		provider.register();

		try {
			const effectTracer = await createEffectTracer();
			let parentSpanId: string | undefined;
			const operation = Effect.fn("operations.workouts.create")(function* () {
				return yield* Effect.succeed("created");
			});

			await trace
				.getTracer("hevy-mcp-test")
				.startActiveSpan("mcp.tool.invoke", async (parent) => {
					parentSpanId = parent.spanContext().spanId;
					const parentEffectSpan = getActiveEffectParentSpan();
					if (!parentEffectSpan) {
						throw new Error("Active OpenTelemetry span was not propagated");
					}
					try {
						await Effect.runPromise(
							Effect.withTracer(
								Effect.withParentSpan(operation(), parentEffectSpan),
								effectTracer,
							),
						);
					} finally {
						parent.end();
					}
				});
			await provider.forceFlush();

			const spans = exporter.getFinishedSpans();
			const effectSpan = spans.find(
				(span) => span.name === "operations.workouts.create",
			);
			expect(effectSpan).toBeDefined();
			expect(effectSpan?.parentSpanContext?.spanId).toBe(parentSpanId);
		} finally {
			await provider.shutdown();
		}
	});
});
