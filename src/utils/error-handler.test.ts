import * as Sentry from "@sentry/node";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createErrorResponse, withErrorHandling } from "./error-handler";

type AxiosLikeError = Error & {
	hevyRetryCount?: number;
	hevyRetryExhausted?: boolean;
	isAxiosError: true;
	response?: {
		data?: unknown;
		headers?: Record<string, string>;
		status: number;
	};
};

function createAxiosError(options: {
	data?: unknown;
	headers?: Record<string, string>;
	message?: string;
	retryCount?: number;
	retryExhausted?: boolean;
	status: number;
}): AxiosLikeError {
	const error = new Error(
		options.message ?? "Request failed",
	) as AxiosLikeError;
	error.isAxiosError = true;
	error.response = {
		status: options.status,
		headers: options.headers,
		data: options.data,
	};

	if (options.retryCount !== undefined) {
		error.hevyRetryCount = options.retryCount;
	}

	if (options.retryExhausted) {
		error.hevyRetryExhausted = true;
	}

	return error;
}

const sentryTestDoubles = vi.hoisted(() => ({
	span: {
		setAttribute: vi.fn(),
		setStatus: vi.fn(),
	},
	scope: {
		setTag: vi.fn(),
		setContext: vi.fn(),
	},
}));

vi.mock("@sentry/node", () => ({
	startSpan: vi.fn((_, callback) => callback(sentryTestDoubles.span)),
	withScope: vi.fn((callback) => callback(sentryTestDoubles.scope)),
	captureException: vi.fn(),
}));

describe("Error Handler", () => {
	describe("createErrorResponse", () => {
		// Mock console.error to prevent test output pollution
		const _originalConsoleError = console.error;
		const _originalConsoleDebug = console.debug;

		// Setup mocks before each test
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "debug").mockImplementation(() => {});

		// Restore original console methods after all tests
		afterAll(() => {
			vi.restoreAllMocks();
		});

		it("should create a proper error response from an Error object", () => {
			const error = new Error("Test error message");
			const response = createErrorResponse(error);

			expect(response).toEqual({
				content: [
					{
						type: "text",
						text: "Error: Test error message",
					},
				],
				isError: true,
			});
			expect(console.error).toHaveBeenCalled();
		});

		it("should create a proper error response from a string", () => {
			const response = createErrorResponse("String error message");

			expect(response).toEqual({
				content: [
					{
						type: "text",
						text: "Error: String error message",
					},
				],
				isError: true,
			});
		});

		it("should include context in the error message when provided", () => {
			const error = new Error("Test error with context");
			const response = createErrorResponse(error, "TestContext");

			expect(response.content[0].text).toBe(
				"[TestContext] Error: Test error with context",
			);
		});

		it("should handle errors with code property", () => {
			const errorWithCode = new Error("Error with code");
			// Add a code property to the error
			Object.defineProperty(errorWithCode, "code", {
				value: "ERR_TEST_CODE",
				enumerable: true,
			});

			const response = createErrorResponse(errorWithCode);

			expect(response.content[0].text).toBe("Error: Error with code");
			expect(console.debug).not.toHaveBeenCalled();
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining("Code: ERR_TEST_CODE"),
				errorWithCode,
			);
		});

		it("classifies network-related errors as NETWORK_ERROR", () => {
			const error = new Error("Network request failed");
			createErrorResponse(error);
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining("(Type: NETWORK_ERROR)"),
				error,
			);
		});

		it("classifies validation errors as VALIDATION_ERROR", () => {
			const error = new Error("Validation failed: required field missing");
			createErrorResponse(error);
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining("(Type: VALIDATION_ERROR)"),
				error,
			);
		});

		it("classifies not found errors as NOT_FOUND", () => {
			const error = new Error("Resource not found");
			createErrorResponse(error);
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining("(Type: NOT_FOUND)"),
				error,
			);
		});

		it("classifies API errors as API_ERROR", () => {
			const error = new Error("API server error 500");
			createErrorResponse(error);
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining("(Type: API_ERROR)"),
				error,
			);
		});

		it("shows actionable message for 429 rate limits", () => {
			const error = createAxiosError({
				headers: { "retry-after": "12" },
				status: 429,
			});

			const response = createErrorResponse(error, "get-workouts");

			expect(response.content[0].text).toBe(
				"[get-workouts] Error: Rate limited by Hevy (HTTP 429). " +
					"Please wait about 12 seconds before retrying.",
			);
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining("(Type: RATE_LIMIT)"),
				error,
			);
		});

		it("handles Retry-After as HTTP-date for 429 messages", () => {
			const now = 1_700_000_000_000;
			vi.spyOn(Date, "now").mockReturnValue(now);

			const error = createAxiosError({
				headers: {
					"retry-after": new Date(now + 5_000).toUTCString(),
				},
				status: 429,
			});

			const response = createErrorResponse(error);

			expect(response.content[0].text).toBe(
				"Error: Rate limited by Hevy (HTTP 429). " +
					"Please wait about 5 seconds before retrying.",
			);
		});

		it("surfaces clearer message when retries are exhausted", () => {
			const error = createAxiosError({
				message: "timeout of 30000ms exceeded",
				retryCount: 3,
				retryExhausted: true,
				status: 503,
			});

			const response = createErrorResponse(error, "get-routines");

			expect(response.content[0].text).toBe(
				"[get-routines] Error: Unable to complete the request " +
					"after 4 attempts to the Hevy API due to transient " +
					"failures. Please try again shortly.",
			);
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining("(Type: NETWORK_ERROR)"),
				error,
			);
		});
	});

	describe("withErrorHandling", () => {
		// Setup mocks before tests
		vi.spyOn(console, "error").mockImplementation(() => {});

		// Restore original console methods after all tests
		afterAll(() => {
			vi.restoreAllMocks();
		});

		it("should return the function result when no error occurs", async () => {
			const mockFn = vi.fn().mockResolvedValue({
				content: [{ type: "text", text: "Success" }],
			});

			const wrappedFn = withErrorHandling(mockFn, "TestContext");
			const result = await wrappedFn({ param: "test" });

			expect(result).toEqual({
				content: [{ type: "text", text: "Success" }],
			});
			expect(mockFn).toHaveBeenCalledWith({ param: "test" });
			expect(Sentry.startSpan).toHaveBeenCalledWith(
				expect.objectContaining({ op: "mcp.tool.execute" }),
				expect.any(Function),
			);
		});

		it("should handle errors thrown by the wrapped function", async () => {
			const mockFn = vi.fn().mockImplementation(() => {
				throw new Error("Function error");
			});

			const wrappedFn = withErrorHandling(mockFn, "ErrorTest");
			const result = await wrappedFn({ param: "test" });

			expect(result).toEqual({
				content: [
					{
						type: "text",
						text: "[ErrorTest] Error: Function error",
					},
				],
				isError: true,
			});
			expect(mockFn).toHaveBeenCalledWith({ param: "test" });
			// We don't check console.error here as we're using a different mocking approach
			expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
		});
	});
});
