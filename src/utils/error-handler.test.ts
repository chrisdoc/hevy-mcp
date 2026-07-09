import { afterAll, describe, expect, it, vi } from "vitest";
import { createErrorResponse, withErrorHandling } from "./error-handler";
import { Sentry } from "./telemetry.js";

const testDoubles = vi.hoisted(() => ({
	span: {
		setAttribute: vi.fn(),
		setStatus: vi.fn(),
		recordException: vi.fn(),
		end: vi.fn(),
	},
	scope: {
		setTag: vi.fn(),
		setContext: vi.fn(),
	},
	startActiveSpan: vi.fn((...args: unknown[]) => {
		const cb = args[args.length - 1] as (span: unknown) => unknown;
		return cb(testDoubles.span);
	}),
}));

vi.mock("./telemetry.js", () => ({
	Sentry: {
		withScope: vi.fn((cb: (scope: unknown) => void) => cb(testDoubles.scope)),
		captureException: vi.fn(),
	},
	tracer: {
		startActiveSpan: testDoubles.startActiveSpan,
	},
	meter: {
		createCounter: vi.fn(() => ({ add: vi.fn() })),
		createHistogram: vi.fn(() => ({ record: vi.fn() })),
	},
	serviceName: "hevy-mcp",
	serviceVersion: "dev",
}));

vi.mock("./metrics.js", () => ({
	toolInvocations: { add: vi.fn() },
	toolErrors: { add: vi.fn() },
	toolDuration: { record: vi.fn() },
	apiCalls: { add: vi.fn() },
	apiDuration: { record: vi.fn() },
	stdioParseErrors: { add: vi.fn() },
	serverStartups: { add: vi.fn() },
}));

vi.mock("@opentelemetry/api", () => ({
	SpanStatusCode: { OK: 1, ERROR: 2 },
	trace: { getTracer: vi.fn() },
	metrics: { getMeter: vi.fn() },
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

		it("uses axios string response data when available", () => {
			const response = createErrorResponse({
				isAxiosError: true,
				response: {
					data: "Service unavailable",
				},
			});

			expect(response.content[0].text).toBe("Error: Service unavailable");
		});

		it("stringifies axios object response data when possible", () => {
			const response = createErrorResponse({
				isAxiosError: true,
				response: {
					data: { message: "validation failed", retryable: false },
				},
			});

			expect(response.content[0].text).toBe(
				'Error: {"message":"validation failed","retryable":false}',
			);
		});

		it("falls back to String(data) when axios object response data is not serializable", () => {
			const circular: { self?: unknown } = {};
			circular.self = circular;

			const response = createErrorResponse({
				isAxiosError: true,
				response: {
					data: circular,
				},
			});

			expect(response.content[0].text).toBe("Error: [object Object]");
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
			expect(testDoubles.startActiveSpan).toHaveBeenCalledWith(
				"mcp.tool.TestContext",
				expect.objectContaining({
					attributes: expect.objectContaining({
						"mcp.tool.context": "TestContext",
					}),
				}),
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
			expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
		});
	});
});
