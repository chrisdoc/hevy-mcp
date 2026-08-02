import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HevyRequestObservation } from "@hevy-mcp/hevy-client";
import { HevyHttpError } from "@hevy-mcp/hevy-client";
import { createNodeHevyClientOptions } from "./hevy-client-observability.js";

const testDoubles = vi.hoisted(() => ({
	span: {
		addEvent: vi.fn(),
		end: vi.fn(),
		setAttribute: vi.fn(),
		setStatus: vi.fn(),
	},
	startActiveSpan: vi.fn((...args: unknown[]) => {
		const callback = args.at(-1) as (span: unknown) => unknown;
		return callback(testDoubles.span);
	}),
	apiCallsAdd: vi.fn(),
	apiDurationRecord: vi.fn(),
}));
vi.mock("./telemetry.js", () => ({
	tracer: { startActiveSpan: testDoubles.startActiveSpan },
}));

vi.mock("./metrics.js", () => ({
	apiCalls: { add: testDoubles.apiCallsAdd },
	apiDuration: { record: testDoubles.apiDurationRecord },
}));

vi.mock("@opentelemetry/api", () => ({
	SpanStatusCode: { OK: 1, ERROR: 2 },
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

		expect(testDoubles.startActiveSpan).toHaveBeenCalledWith(
			"hevy.api.GET",
			{
				attributes: {
					"mcp.span.category": "api",
					"http.method": "GET",
					"hevy.api.retry_count_bucket": "0",
					"hevy.api.endpoint": "/v1/user/info",
					"mcp.transport": "stdio",
				},
			},
			expect.any(Function),
		);
		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({ code: 1 });
		expect(testDoubles.span.addEvent).not.toHaveBeenCalled();
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

		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({ code: 2 });
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

		expect(testDoubles.span.addEvent).toHaveBeenCalledWith("hevy.api.failure", {
			"error.category": "HevyHttpError",
			"error.code": "HEVY_RETRY_EXHAUSTED",
		});
	});

	it("accepts only a positive finite timeout override", () => {
		process.env.HEVY_MCP_API_TIMEOUT = "1500.9";
		expect(createNodeHevyClientOptions().timeoutMs).toBe(1500);

		process.env.HEVY_MCP_API_TIMEOUT = "invalid";
		expect(createNodeHevyClientOptions().timeoutMs).toBeUndefined();
	});
});
