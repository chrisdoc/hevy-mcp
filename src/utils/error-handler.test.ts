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
		const result = createErrorResponse(
			new Error("Bearer secret-ordinary-error"),
			"test-tool",
		);
		expect(result).toMatchObject({
			isError: true,
			content: [
				{
					type: "text",
					text: "[test-tool] Error: The request failed unexpectedly. Please try again.",
				},
			],
		});
		expect(JSON.stringify(result)).not.toContain("secret-ordinary-error");
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
		const error = httpError(400, { error: secret });
		error.message = secret;
		error.code = secret;
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const result = createErrorResponse(error);
		expect(result.content[0]?.text).toContain(
			"Hevy API request failed (HTTP 400)",
		);
		expect(JSON.stringify(result)).not.toContain(secret);
		expect(JSON.stringify(stderrSpy.mock.calls)).not.toContain(secret);
		stderrSpy.mockRestore();
	});

	it("omits hostile HTTP metadata from retained debug context", () => {
		const secret = "sentinel-http-context";
		const error = new HevyHttpError(secret, {
			status: 999,
			statusText: secret,
			method: secret,
			endpoint: `https://attacker.example/${secret}`,
			code: secret,
			headers: new Headers({ authorization: secret }),
			data: { secret },
			cause: new Error(secret),
		});
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const result = createErrorResponse(error);

		expect(result.errorContext).toEqual(
			expect.objectContaining({ axios: undefined }),
		);
		expect(JSON.stringify(result.errorContext)).not.toContain(secret);
		expect(JSON.stringify(stderrSpy.mock.calls)).not.toContain(secret);
		stderrSpy.mockRestore();
	});

	it("includes bounded Retry-After guidance for rate limits", () => {
		const result = createErrorResponse(
			httpError(429, undefined, new Headers({ "retry-after": "3" })),
		);
		expect(result.content[0]?.text).toContain("about 3 seconds");
	});

	it("accepts bounded numeric and array Retry-After header records", () => {
		const numericHeaderError = httpError(429);
		Object.defineProperty(numericHeaderError, "headers", {
			value: { "retry-after": 1 },
		});
		const arrayHeaderError = httpError(429);
		Object.defineProperty(arrayHeaderError, "headers", {
			value: { "RETRY-AFTER": ["2", "ignored"] },
		});

		expect(createErrorResponse(numericHeaderError).content[0]?.text).toContain(
			"about 1 second",
		);
		expect(createErrorResponse(arrayHeaderError).content[0]?.text).toContain(
			"about 2 seconds",
		);
	});

	it("handles HTTP-date, missing, and malformed Retry-After guidance", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-11T12:00:00.000Z"));
		try {
			const dateResult = createErrorResponse(
				httpError(
					429,
					undefined,
					new Headers({
						"retry-after": "Sat, 11 Jul 2026 12:00:05 GMT",
					}),
				),
			);
			const missingResult = createErrorResponse(httpError(429));
			const malformedResult = createErrorResponse(
				httpError(429, undefined, new Headers({ "retry-after": "not-a-date" })),
			);

			expect(dateResult.content[0]?.text).toContain("about 5 seconds");
			expect(missingResult.content[0]?.text).toContain(
				"Please wait and retry your request",
			);
			expect(malformedResult.content[0]?.text).toContain(
				"Please wait and retry your request",
			);
		} finally {
			vi.useRealTimers();
		}
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

	it("uses generic retry exhaustion guidance without a finite retry count", () => {
		const error = httpError(503);
		error.hevyRetryExhausted = true;
		error.hevyRetryCount = Number.NaN;

		const result = createErrorResponse(error);

		expect(result.content[0]?.text).toContain("after multiple attempts");
	});

	it("does not expose non-Error thrown values in client responses", () => {
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		const cases: unknown[] = [
			"Bearer secret-string",
			{ message: "secret-object-message" },
			{ reason: "secret-structured-value" },
			cyclic,
			17,
		];

		for (const thrownValue of cases) {
			const result = createErrorResponse(thrownValue);
			expect(result.content[0]?.text).toContain(
				"The request failed unexpectedly",
			);
			expect(JSON.stringify(result)).not.toContain("secret-");
		}
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

	it("reports zero argument keys for a nullish direct invocation", async () => {
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

	it("does not replace normalized responses when observers fail", async () => {
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const wrapped = withErrorHandling(
			async () => {
				throw new Error("original failure");
			},
			"test",
			() => {
				throw new Error("observer secret");
			},
		);

		await expect(wrapped({})).resolves.toMatchObject({ isError: true });
		expect(JSON.stringify(stderrSpy.mock.calls)).not.toContain(
			"observer secret",
		);
		stderrSpy.mockRestore();
	});
});
