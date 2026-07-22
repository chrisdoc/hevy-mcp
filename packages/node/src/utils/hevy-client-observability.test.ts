import { beforeEach, describe, expect, it, vi } from "vitest";
import { HevyHttpError } from "@hevy-mcp/hevy-client";
import { createNodeHevyClientOptions } from "./hevy-client-observability.js";

const testDoubles = vi.hoisted(() => ({
	span: {
		addEvent: vi.fn(),
		end: vi.fn(),
		setStatus: vi.fn(),
	},
	startSpan: vi.fn(),
	apiCallsAdd: vi.fn(),
	apiDurationRecord: vi.fn(),
}));

testDoubles.startSpan.mockReturnValue(testDoubles.span);

vi.mock("./telemetry.js", () => ({
	tracer: { startSpan: testDoubles.startSpan },
}));

vi.mock("./metrics.js", () => ({
	apiCalls: { add: testDoubles.apiCallsAdd },
	apiDuration: { record: testDoubles.apiDurationRecord },
}));

vi.mock("@opentelemetry/api", () => ({
	SpanStatusCode: { OK: 1, ERROR: 2 },
}));

describe("createNodeHevyClientOptions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env.HEVY_MCP_API_TIMEOUT;
	});

	it("records successful requests with bounded operational metadata", () => {
		const options = createNodeHevyClientOptions();

		options.onRequestComplete?.({
			method: "GET",
			endpoint: "/v1/user/info",
			status: 200,
			durationMs: 12,
			retryCount: 0,
		});

		expect(testDoubles.startSpan).toHaveBeenCalledWith("hevy.api.GET", {
			attributes: {
				"http.method": "GET",
				"http.status_code": 200,
				"hevy.api.retry_count_bucket": "0",
				"hevy.api.endpoint": "/v1/user/info",
			},
		});
		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({ code: 1 });
		expect(testDoubles.span.addEvent).not.toHaveBeenCalled();
		expect(testDoubles.span.end).toHaveBeenCalledOnce();
		expect(testDoubles.apiCallsAdd).toHaveBeenCalledWith(1, {
			method: "GET",
			endpoint: "/v1/user/info",
			status_code: 200,
			retry_count_bucket: "0",
		});
		expect(testDoubles.apiDurationRecord).toHaveBeenCalledWith(12, {
			method: "GET",
			endpoint: "/v1/user/info",
			retry_count_bucket: "0",
		});
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

		options.onRequestComplete?.({
			method: "GET",
			endpoint: "/v1/user/info",
			status: 503,
			durationMs: 25,
			retryCount: 1,
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

		options.onRequestComplete?.({
			method: "GET",
			endpoint: "/v1/user/info",
			status: 0,
			durationMs: 25,
			retryCount: 0,
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
