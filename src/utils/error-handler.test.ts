import { afterAll, describe, expect, it, vi } from "vitest";
import { createErrorResponse, withErrorHandling } from "./error-handler";

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
			expect(console.debug).toHaveBeenCalledWith("Error code: ERR_TEST_CODE");
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
		});
	});
});
