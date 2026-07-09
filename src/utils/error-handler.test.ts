import * as Sentry from "@sentry/node";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createErrorResponse, withErrorHandling } from "./error-handler";

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

		it("handles rejected promises from the wrapped function", async () => {
			const mockFn = vi
				.fn()
				.mockRejectedValue(new Error("Async handler failure"));

			const wrappedFn = withErrorHandling(mockFn, "RejectContext");
			const result = await wrappedFn({ param: "test" });

			expect(result).toMatchObject({
				isError: true,
				content: [
					{
						type: "text",
						text: "[RejectContext] Error: Async handler failure",
					},
				],
			});
			expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
		});

		it("handles non-Error values thrown by the wrapped function", async () => {
			const mockFn = vi.fn().mockImplementation(() => {
				throw "plain string failure";
			});

			const wrappedFn = withErrorHandling(mockFn, "NonErrorContext");
			const result = await wrappedFn({});

			expect(result).toMatchObject({
				isError: true,
				content: [
					{
						type: "text",
						text: "[NonErrorContext] Error: plain string failure",
					},
				],
			});
			expect(Sentry.captureException).toHaveBeenCalledWith(
				"plain string failure",
			);
		});

		it("handles axios-specific errors from wrapped handlers", async () => {
			const axiosLikeError = {
				message: "Request failed with status code 503",
				isAxiosError: true,
				response: {
					data: {
						error: "service unavailable",
						code: "E_SERVICE_UNAVAILABLE",
					},
				},
			};
			const mockFn = vi.fn().mockImplementation(() => {
				throw axiosLikeError;
			});

			const wrappedFn = withErrorHandling(mockFn, "AxiosContext");
			const result = await wrappedFn({});

			expect(result).toMatchObject({ isError: true });
			expect(result.content[0]?.text).toContain("service unavailable");
			expect(result.content[0]?.text).toContain("E_SERVICE_UNAVAILABLE");
			expect(Sentry.captureException).toHaveBeenCalledWith(axiosLikeError);
		});
	});
});
