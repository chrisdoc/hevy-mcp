import { describe, expect, it, vi } from "vitest";
import { withErrorHandling } from "./error-handler.js";
import { withObservability } from "./observability-wrapper.js";
import { withTelemetry } from "./telemetry-wrapper.js";

const testDoubles = vi.hoisted(() => ({
	events: [] as string[],
	scope: {
		setTag: vi.fn(),
		setContext: vi.fn(),
	},
	captureException: vi.fn(),
}));

vi.mock("./error-handler.js", () => ({
	withErrorHandling: vi.fn(
		(
			fn: (args: Record<string, unknown>) => Promise<unknown>,
			_context: string,
			onError?: (
				error: unknown,
				context: string,
				argumentKeyCount: number,
			) => void,
		) =>
			async (args: Record<string, unknown>) => {
				testDoubles.events.push("error-handling:start");
				try {
					return await fn(args);
				} catch (error) {
					testDoubles.events.push("error-handling:catch");
					onError?.(error, _context, Object.keys(args).length);
					return { content: [], isError: true };
				}
			},
	),
}));

vi.mock("./telemetry.js", () => ({
	Sentry: {
		withScope: vi.fn((callback: (scope: typeof testDoubles.scope) => void) =>
			callback(testDoubles.scope),
		),
		captureException: testDoubles.captureException,
	},
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
			expect.any(Function),
		);
		expect(testDoubles.events).toEqual([
			"error-handling:start",
			"telemetry:start",
			"handler",
			"telemetry:catch",
			"error-handling:catch",
		]);
		expect(result).toEqual({ content: [], isError: true });
		expect(testDoubles.scope.setTag).toHaveBeenCalledWith(
			"mcp.tool.context",
			"test-context",
		);
		expect(testDoubles.scope.setContext).toHaveBeenCalledWith("mcpTool", {
			context: "test-context",
			argumentKeyCount: 1,
		});
		expect(testDoubles.captureException).toHaveBeenCalledWith(error);
	});
});
