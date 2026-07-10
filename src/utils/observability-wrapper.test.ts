import { describe, expect, it, vi } from "vitest";
import { withErrorHandling } from "./error-handler.js";
import { withObservability } from "./observability-wrapper.js";
import { withTelemetry } from "./telemetry-wrapper.js";

const testDoubles = vi.hoisted(() => ({
	events: [] as string[],
}));

vi.mock("./error-handler.js", () => ({
	withErrorHandling: vi.fn(
		(
			fn: (args: Record<string, unknown>) => Promise<unknown>,
			_context: string,
		) =>
			async (args: Record<string, unknown>) => {
				testDoubles.events.push("error-handling:start");
				try {
					return await fn(args);
				} catch {
					testDoubles.events.push("error-handling:catch");
					return { content: [], isError: true };
				}
			},
	),
}));

vi.mock("./telemetry-wrapper.js", () => ({
	withTelemetry: vi.fn(
		(
			fn: (args: Record<string, unknown>) => Promise<unknown>,
			_context: string,
		) =>
			async (args: Record<string, unknown>) => {
				testDoubles.events.push("telemetry:start");
				try {
					return await fn(args);
				} catch (error) {
					testDoubles.events.push("telemetry:catch");
					throw error;
				}
			},
	),
}));

describe("withObservability", () => {
	it("keeps telemetry inside error handling so it sees original exceptions", async () => {
		const error = new Error("boom");
		const handler = vi.fn(async () => {
			testDoubles.events.push("handler");
			throw error;
		});

		const wrapped = withObservability(handler, "test-context");
		const result = await wrapped({ page: 1 });

		expect(withTelemetry).toHaveBeenCalledWith(handler, "test-context");
		expect(withErrorHandling).toHaveBeenCalledWith(
			expect.any(Function),
			"test-context",
		);
		expect(testDoubles.events).toEqual([
			"error-handling:start",
			"telemetry:start",
			"handler",
			"telemetry:catch",
			"error-handling:catch",
		]);
		expect(result).toEqual({ content: [], isError: true });
	});
});
