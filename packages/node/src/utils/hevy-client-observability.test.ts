import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpanStatusCode } from "@opentelemetry/api";
import {
	HevyHttpError,
	type HevyRequestObservation,
} from "@hevy-mcp/hevy-client";
import {
	createNodeCacheObserver,
	createNodeHevyClientOptions,
} from "./hevy-client-observability.js";

const testDoubles = vi.hoisted(() => ({
	span: {
		addEvent: vi.fn(),
		end: vi.fn(),
		setAttribute: vi.fn(),
		setStatus: vi.fn(),
	},
	startSpan: vi.fn(() => testDoubles.span),
	apiCallsAdd: vi.fn(),
	apiDurationRecord: vi.fn(),
	contextActive: vi.fn(() => "active-context"),
	contextWith: vi.fn((_context: unknown, operation: () => Promise<unknown>) =>
		operation(),
	),
	traceSetSpan: vi.fn(
		(_context: unknown, _span: unknown) => "api-span-context",
	),
}));
vi.mock("./telemetry.js", () => ({
	tracer: { startSpan: testDoubles.startSpan },
}));

vi.mock("./metrics.js", () => ({
	apiCalls: { add: testDoubles.apiCallsAdd },
	apiDuration: { record: testDoubles.apiDurationRecord },
}));

vi.mock("@opentelemetry/api", () => ({
	SpanStatusCode: { OK: 1, ERROR: 2 },
	context: {
		active: testDoubles.contextActive,
		with: testDoubles.contextWith,
	},
	trace: {
		setSpan: testDoubles.traceSetSpan,
	},
}));

function observe(
	options: ReturnType<typeof createNodeHevyClientOptions>,
	observation: HevyRequestObservation,
): void {
	const scope = options.onRequestStart?.({
		method: observation.method,
		endpoint: observation.endpoint,
		retryCount: observation.retryCount,
	});
	if (scope) scope.finish(observation);
	options.onRequestComplete?.(observation);
}
describe("createNodeHevyClientOptions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env.HEVY_MCP_API_TIMEOUT;
	});

	it("records successful requests with bounded operational metadata", () => {
		const options = createNodeHevyClientOptions();

		observe(options, {
			method: "GET",
			endpoint: "/v1/user/info",
			status: 200,
			durationMs: 12,
			retryCount: 0,
			outcome: "success",
		});

		expect(testDoubles.startSpan).toHaveBeenCalledWith("hevy.api.GET", {
			attributes: {
				"mcp.span.category": "api",
				"http.request.method": "GET",
				"hevy.api.retry_count_bucket": "0",
				"hevy.api.endpoint": "/v1/user/info",
				"mcp.transport": "stdio",
			},
		});
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"http.response.status_code",
			200,
		);
		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({
			code: SpanStatusCode.OK,
		});
		expect(testDoubles.span.end).toHaveBeenCalledOnce();
		expect(testDoubles.apiCallsAdd).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				method: "GET",
				endpoint: "/v1/user/info",
				status_code: 200,
				retry_count_bucket: "0",
				outcome: "success",
				transport: "stdio",
			}),
		);
		expect(testDoubles.apiDurationRecord).toHaveBeenCalledWith(
			12,
			expect.objectContaining({
				method: "GET",
				endpoint: "/v1/user/info",
				retry_count_bucket: "0",
				outcome: "success",
				transport: "stdio",
			}),
		);
	});

	it("runs request work and retry waits under the API span context", async () => {
		const options = createNodeHevyClientOptions();
		const scope = options.onRequestStart?.({
			method: "GET",
			endpoint: "/v1/user/info",
			retryCount: 0,
		});
		if (!scope?.run) throw new Error("Expected scoped API request");

		await scope.run(async () => {});

		expect(testDoubles.contextActive).toHaveBeenCalled();
		expect(testDoubles.traceSetSpan).toHaveBeenCalledWith(
			"active-context",
			testDoubles.span,
		);
		expect(testDoubles.contextWith).toHaveBeenCalledWith(
			"api-span-context",
			expect.any(Function),
		);
	});

	it("never records raw request errors", () => {
		const secret = "sentinel-client-observation";
		const error = new HevyHttpError(secret, {
			status: 503,
			method: "GET",
			endpoint: "/v1/user/info",
			code: secret,
			data: { secret },
			cause: new Error(secret),
		});
		const options = createNodeHevyClientOptions();

		observe(options, {
			method: "GET",
			endpoint: "/v1/user/info",
			status: 503,
			durationMs: 25,
			retryCount: 1,
			outcome: "terminal_failure",
			error,
		});

		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({
			code: SpanStatusCode.ERROR,
		});
		expect(testDoubles.span.addEvent).toHaveBeenCalledWith("hevy.api.failure", {
			"error.category": "HevyHttpError",
		});
		expect(testDoubles.apiCallsAdd).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				error_category: "HevyHttpError",
			}),
		);
		expect(JSON.stringify(testDoubles.span.addEvent.mock.calls)).not.toContain(
			secret,
		);
	});

	it("records allowlisted error codes and normalizes an absent status", () => {
		const error = new HevyHttpError("private retry message", {
			method: "GET",
			endpoint: "/v1/user/info",
			code: "HEVY_RETRY_EXHAUSTED",
		});
		const options = createNodeHevyClientOptions();

		observe(options, {
			method: "GET",
			endpoint: "/v1/user/info",
			status: 0,
			durationMs: 25,
			retryCount: 0,
			outcome: "terminal_failure",
			error,
		});
		expect(testDoubles.span.setAttribute).not.toHaveBeenCalledWith(
			"http.response.status_code",
			0,
		);

		expect(testDoubles.span.addEvent).toHaveBeenCalledWith("hevy.api.failure", {
			"error.category": "HevyHttpError",
			"error.code": "HEVY_RETRY_EXHAUSTED",
		});
	});
	it("records retry waits and cache lifecycle metadata on dedicated spans", () => {
		const options = createNodeHevyClientOptions();
		const retryScope = options.onRetryWait?.({
			method: "GET",
			endpoint: "/v1/user/info",
			retryCount: 1,
			delayMs: 300,
		});
		if (!retryScope) throw new Error("Expected retry wait scope");
		retryScope.finish();

		const cacheScope = createNodeCacheObserver().start({ state: "miss" });
		if (!cacheScope) throw new Error("Expected cache observation scope");
		cacheScope.finish({
			refreshReason: "initial-load",
			pageCountBucket: "1",
			itemCountBucket: "2-10",
		});

		expect(testDoubles.startSpan).toHaveBeenNthCalledWith(
			1,
			"hevy.api.retry_wait",
			expect.objectContaining({
				attributes: expect.objectContaining({
					"http.request.method": "GET",
					"hevy.api.retry_count_bucket": "1",
					"hevy.api.retry_wait_ms": 300,
				}),
			}),
		);
		expect(testDoubles.startSpan).toHaveBeenNthCalledWith(
			2,
			"hevy.cache.miss",
			expect.objectContaining({
				attributes: expect.objectContaining({
					"hevy.cache.state": "miss",
				}),
			}),
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"hevy.cache.refresh_reason",
			"initial-load",
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"hevy.cache.page_count_bucket",
			"1",
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"hevy.cache.item_count_bucket",
			"2-10",
		);
		expect(testDoubles.span.end).toHaveBeenCalledTimes(2);
	});

	it("accepts only a positive finite timeout override", () => {
		process.env.HEVY_MCP_API_TIMEOUT = "1500.9";
		expect(createNodeHevyClientOptions().timeoutMs).toBe(1500);

		process.env.HEVY_MCP_API_TIMEOUT = "invalid";
		expect(createNodeHevyClientOptions().timeoutMs).toBeUndefined();
	});
});
