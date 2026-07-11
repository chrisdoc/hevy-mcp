import { describe, expect, it, vi } from "vitest";
import { ErrorType } from "./error-classification.js";
import { createErrorResponse, withErrorHandling } from "./error-handler.js";
import { HevyHttpError } from "./hevy-http-error.js";

function httpError(status: number, data?: unknown, headers?: Headers) {
	return new HevyHttpError(`HTTP ${status}`, {
		status,
		statusText: "Error",
		data,
		headers,
		method: "GET",
		endpoint: "/v1/user/info",
	});
}

describe("createErrorResponse", () => {
	it("formats ordinary errors with context", () => {
		const result = createErrorResponse(new Error("boom"), "test-tool");
		expect(result).toMatchObject({
			isError: true,
			content: [{ type: "text", text: "[test-tool] Error: boom" }],
		});
	});

	it.each([
		[401, "The Hevy API key is invalid or has expired"],
		[404, "The requested resource was not found"],
		[409, "A conflict occurred"],
		[422, "The request failed Hevy validation"],
		[503, "Hevy API experienced an error"],
	])("maps HTTP %s to a safe Hevy message", (status, expected) => {
		const result = createErrorResponse(httpError(status));
		expect(result.content[0]?.text).toContain(expected);
	});

	it("does not expose parsed upstream payloads for unmapped statuses", () => {
		const secret = "upstream-secret-value";
		const result = createErrorResponse(httpError(400, { error: secret }));
		expect(result.content[0]?.text).toContain(
			"Hevy API request failed (HTTP 400)",
		);
		expect(JSON.stringify(result)).not.toContain(secret);
	});

	it("includes bounded Retry-After guidance for rate limits", () => {
		const result = createErrorResponse(
			httpError(429, undefined, new Headers({ "retry-after": "3" })),
		);
		expect(result.content[0]?.text).toContain("about 3 seconds");
	});

	it("classifies exhausted retries as network errors", () => {
		const error = httpError(503);
		error.hevyRetryExhausted = true;
		error.hevyRetryCount = 2;
		const result = createErrorResponse(error);
		expect(result.errorContext).toMatchObject({
			errorType: ErrorType.NETWORK_ERROR,
		});
		expect(result.content[0]?.text).toContain("after 3 attempts");
	});

	it("does not include full URLs or credentials in HTTP debug context", () => {
		const result = createErrorResponse(httpError(500));
		expect(result.errorContext).toMatchObject({
			axios: { method: "GET", url: "/v1/user/info", status: 500 },
		});
		expect(JSON.stringify(result)).not.toContain("api-key");
	});
});

describe("withErrorHandling", () => {
	it("returns successful values unchanged", async () => {
		const expected = { content: [{ type: "text" as const, text: "ok" }] };
		const wrapped = withErrorHandling(async () => expected, "test");
		await expect(wrapped({})).resolves.toBe(expected);
	});

	it("normalizes nullish arguments and reports original failures", async () => {
		const onError = vi.fn();
		const wrapped = withErrorHandling(
			async () => {
				throw new Error("failed");
			},
			"test",
			onError,
		);
		const result = await wrapped(null as never);
		expect(result.isError).toBe(true);
		expect(onError).toHaveBeenCalledWith(expect.any(Error), "test", 0);
	});
});
