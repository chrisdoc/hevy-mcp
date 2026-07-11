import { beforeEach, describe, expect, it, vi } from "vitest";
import { HevyHttpError } from "./hevy-http-error.js";
import { withObservability } from "./observability-wrapper.js";
import { Sentry } from "./telemetry.js";

const testDoubles = vi.hoisted(() => ({
	scope: { setTag: vi.fn(), setContext: vi.fn() },
	sentry: {
		withScope: vi.fn((callback: (scope: unknown) => void) =>
			callback(testDoubles.scope),
		),
		captureMessage: vi.fn(),
	},
}));

vi.mock("./telemetry-wrapper.js", () => ({
	withTelemetry:
		(fn: (args: Record<string, unknown>) => Promise<unknown>) =>
		(args: Record<string, unknown>) =>
			fn(args),
}));
vi.mock("./telemetry.js", () => ({ Sentry: testDoubles.sentry }));

describe("withObservability", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("captures only a fixed event and safe structured diagnostics", async () => {
		const secret = "sentinel-api-key-value";
		const error = new HevyHttpError(secret, {
			status: 503,
			method: "GET",
			endpoint: "/v1/user/info",
			code: "HEVY_RETRY_EXHAUSTED",
			headers: new Headers({ authorization: `Bearer ${secret}` }),
			data: { secret },
		});
		error.stack = `${secret}\n    at /home/user/hevy-mcp/src/utils/observability-wrapper.ts:21:4`;
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const wrapped = withObservability(async () => {
			throw error;
		}, "get-user-info");

		const result = await wrapped({ page: 1, query: "bench" });

		expect(result.isError).toBe(true);
		expect(testDoubles.scope.setTag).toHaveBeenCalledWith(
			"error.category",
			"HevyHttpError",
		);
		expect(testDoubles.scope.setTag).toHaveBeenCalledWith(
			"error.code",
			"HEVY_RETRY_EXHAUSTED",
		);
		expect(testDoubles.scope.setTag).toHaveBeenCalledWith(
			"http.status_code",
			"503",
		);
		expect(testDoubles.scope.setContext).toHaveBeenCalledWith(
			"safeError",
			expect.objectContaining({
				category: "HevyHttpError",
				status: 503,
				endpoint: "/v1/user/info",
				frames: [{ source: "observability-wrapper", line: 21, column: 4 }],
			}),
		);
		expect(testDoubles.scope.setContext).toHaveBeenCalledWith("mcpTool", {
			argumentKeyCount: 2,
		});
		expect(Sentry.captureMessage).toHaveBeenCalledWith(
			"MCP tool failure",
			"error",
		);
		expect(
			JSON.stringify(testDoubles.scope.setContext.mock.calls),
		).not.toContain(secret);
		expect(JSON.stringify(stderrSpy.mock.calls)).not.toContain(secret);
		stderrSpy.mockRestore();
	});

	it("still returns an MCP error when Sentry reporting throws", async () => {
		testDoubles.sentry.withScope.mockImplementationOnce(() => {
			throw new Error("telemetry secret");
		});
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const wrapped = withObservability(async () => {
			throw new Error("handler failure");
		}, "test-context");

		await expect(wrapped({})).resolves.toMatchObject({ isError: true });
		expect(JSON.stringify(stderrSpy.mock.calls)).not.toContain(
			"telemetry secret",
		);
		stderrSpy.mockRestore();
	});

	it("omits optional tags for ordinary errors", async () => {
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const wrapped = withObservability(async () => {
			throw new Error("private ordinary failure");
		}, "test-context");

		await expect(wrapped({})).resolves.toMatchObject({ isError: true });
		expect(testDoubles.scope.setTag).toHaveBeenCalledWith(
			"error.category",
			"Error",
		);
		expect(testDoubles.scope.setTag).not.toHaveBeenCalledWith(
			"error.code",
			expect.anything(),
		);
		expect(testDoubles.scope.setTag).not.toHaveBeenCalledWith(
			"http.status_code",
			expect.anything(),
		);
		stderrSpy.mockRestore();
	});
});
