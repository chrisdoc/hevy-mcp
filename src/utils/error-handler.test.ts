import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createErrorResponse, withErrorHandling } from "./error-handler";
import { Sentry } from "./telemetry.js";

function createMockAxiosError(status: number, data: unknown): unknown {
	return {
		isAxiosError: true,
		name: "AxiosError",
		message: `Request failed with status code ${status}`,
		config: { method: "post", url: "/v1/body_measurements" },
		response: { status, statusText: "Error", data },
	};
}

const testDoubles = vi.hoisted(() => ({
	scope: { setTag: vi.fn(), setContext: vi.fn() },
}));

vi.mock("./telemetry.js", () => ({
	Sentry: {
		withScope: vi.fn((callback: (scope: unknown) => void) =>
			callback(testDoubles.scope),
		),
		captureException: vi.fn(),
	},
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

			expect(response).toMatchObject({
				content: [
					{
						type: "text",
						text: "Error: Test error message",
					},
				],
				isError: true,
				errorContext: {
					originalErrorMessage: "Test error message",
				},
			});
			expect(console.error).toHaveBeenCalled();
		});

		it("should create a proper error response from a string", () => {
			const response = createErrorResponse("String error message");

			expect(response).toMatchObject({
				content: [
					{
						type: "text",
						text: "Error: String error message",
					},
				],
				isError: true,
				errorContext: {
					originalErrorMessage: "String error message",
				},
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

		it("falls back when axios object response data is not serializable", () => {
			const circular: { self?: unknown } = {};
			circular.self = circular;

			const response = createErrorResponse({
				isAxiosError: true,
				response: {
					data: circular,
				},
			});

			expect(response.content[0].text).toBe(
				"Error: Unable to serialize error response data",
			);
		});

		it("should include context in the error message when provided", () => {
			const error = new Error("Test error with context");
			const response = createErrorResponse(error, "TestContext");

			expect(response.content[0].text).toBe(
				"[TestContext] Error: Test error with context",
			);
			expect(response).toMatchObject({
				errorContext: {
					sourceContext: "TestContext",
					originalErrorMessage: "Test error with context",
				},
			});
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
			expect(response).toMatchObject({
				errorContext: {
					errorCode: "ERR_TEST_CODE",
					originalErrorMessage: "Error with code",
				},
			});
			expect(console.debug).not.toHaveBeenCalled();
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining("Code: ERR_TEST_CODE"),
			);
		});

		it.each([
			{
				status: 401,
				expectedMessage:
					"The Hevy API key is invalid or has expired. Check HEVY_API_KEY.",
			},
			{
				status: 403,
				expectedMessage:
					"The Hevy API key is invalid or has expired. Check HEVY_API_KEY.",
			},
			{
				status: 404,
				expectedMessage: "The requested resource was not found in Hevy.",
			},
			{
				status: 409,
				expectedMessage:
					"A conflict occurred (e.g., a body measurement already exists for this date). Use the update tool instead.",
			},
			{
				status: 422,
				expectedMessage:
					"The request failed Hevy validation. Check the field values and try again.",
			},
			{
				status: 429,
				expectedMessage:
					"Rate limited by Hevy (HTTP 429). Please wait and retry your request.",
			},
			{
				status: 503,
				expectedMessage: "Hevy API experienced an error. Please retry later.",
			},
		])(
			"maps axios status $status to actionable Hevy message",
			({ status, expectedMessage }) => {
				const responseBody = {
					error: "original_api_error",
					detail: `raw detail for status ${status}`,
				};
				const response = createErrorResponse(
					createMockAxiosError(status, responseBody),
					"TestContext",
				);

				expect(response.content[0].text).toBe(
					`[TestContext] Error: ${expectedMessage}`,
				);
				expect(response).toMatchObject({
					isError: true,
					errorContext: {
						sourceContext: "TestContext",
						originalErrorMessage: `Request failed with status code ${status}`,
						axios: {
							status,
							data: responseBody,
							method: "post",
							url: "/v1/body_measurements",
						},
					},
				});
			},
		);

		it("includes Retry-After in 429 error messages", () => {
			const response = createErrorResponse({
				isAxiosError: true,
				response: {
					headers: { "retry-after": "12" },
					status: 429,
				},
			});

			expect(response.content[0].text).toBe(
				"Error: Rate limited by Hevy (HTTP 429). " +
					"Please wait about 12 seconds before retrying.",
			);
		});

		it("reads Retry-After from header getters with array values", () => {
			const response = createErrorResponse({
				isAxiosError: true,
				response: {
					headers: { get: () => [4] },
					status: 429,
				},
			});

			expect(response.content[0].text).toBe(
				"Error: Rate limited by Hevy (HTTP 429). " +
					"Please wait about 4 seconds before retrying.",
			);
		});

		it("includes HTTP-date Retry-After values in 429 error messages", () => {
			const now = Date.parse("2026-07-09T19:40:00Z");
			vi.spyOn(Date, "now").mockReturnValue(now);
			const response = createErrorResponse({
				isAxiosError: true,
				response: {
					headers: {
						"retry-after": new Date(now + 2_000).toUTCString(),
					},
					status: 429,
				},
			});

			expect(response.content[0].text).toBe(
				"Error: Rate limited by Hevy (HTTP 429). " +
					"Please wait about 2 seconds before retrying.",
			);
		});

		it("falls back to the generic message for invalid Retry-After values", () => {
			const response = createErrorResponse({
				isAxiosError: true,
				response: {
					headers: { "retry-after": "not-a-date" },
					status: 429,
				},
			});

			expect(response.content[0].text).toBe(
				"Error: Rate limited by Hevy (HTTP 429). " +
					"Please wait and retry your request.",
			);
		});

		it("prioritizes exhausted retry errors over status mappings", () => {
			const response = createErrorResponse({
				hevyRetryCount: 2,
				hevyRetryExhausted: true,
				isAxiosError: true,
				response: { status: 503 },
			});

			expect(response.content[0].text).toBe(
				"Error: Unable to complete the request after 3 attempts " +
					"to the Hevy API due to transient failures. Please try again shortly.",
			);
		});

		it("describes exhausted retry errors without a retry count", () => {
			const response = createErrorResponse({
				hevyRetryExhausted: true,
				isAxiosError: true,
				response: { status: 503 },
			});

			expect(response.content[0].text).toBe(
				"Error: Unable to complete the request after multiple attempts " +
					"to the Hevy API due to transient failures. Please try again shortly.",
			);
		});

		it("uses raw axios string data when no Hevy status mapping exists", () => {
			const response = createErrorResponse(
				createMockAxiosError(400, "plain upstream message"),
				"TestContext",
			);

			expect(response.content[0].text).toBe(
				"[TestContext] Error: plain upstream message",
			);
			expect(response).toMatchObject({
				errorContext: {
					originalErrorMessage: "Request failed with status code 400",
					axios: {
						status: 400,
						data: "plain upstream message",
					},
				},
			});
		});

		it("serializes axios object data when no Hevy status mapping exists", () => {
			const responseBody = {
				detail: "Missing workout entry",
			};
			const response = createErrorResponse(
				createMockAxiosError(400, responseBody),
				"TestContext",
			);

			expect(response.content[0].text).toBe(
				`[TestContext] Error: ${JSON.stringify(responseBody)}`,
			);
		});

		it("stringifies axios primitive data when no Hevy status mapping exists", () => {
			const response = createErrorResponse(
				createMockAxiosError(400, 42),
				"TestContext",
			);

			expect(response.content[0].text).toBe("[TestContext] Error: 42");
		});

		it("serializes object errors without a message field", () => {
			const response = createErrorResponse({
				detail: "Missing workout entry",
			});

			expect(response.content[0].text).toBe(
				'Error: {"detail":"Missing workout entry"}',
			);
			expect(response).toMatchObject({
				errorContext: {
					originalErrorMessage: '{"detail":"Missing workout entry"}',
				},
			});
		});

		it("falls back when error objects cannot be serialized", () => {
			const circularError: { self?: unknown } = {};
			circularError.self = circularError;

			const response = createErrorResponse(circularError);

			expect(response.content[0].text).toBe("Error: Unknown error object");
			expect(response).toMatchObject({
				errorContext: {
					originalErrorMessage: "Unknown error object",
				},
			});
		});

		it("falls back when axios response data cannot be serialized", () => {
			const circularData: { self?: unknown } = {};
			circularData.self = circularData;

			const response = createErrorResponse(
				createMockAxiosError(400, circularData),
				"TestContext",
			);

			expect(response.content[0].text).toBe(
				"[TestContext] Error: Unable to serialize error response data",
			);
			expect(response).toMatchObject({
				errorContext: {
					axios: {
						status: 400,
						data: circularData,
					},
				},
			});
		});

		it("stringifies non-object thrown values", () => {
			const response = createErrorResponse(0);

			expect(response.content[0].text).toBe("Error: 0");
			expect(response).toMatchObject({
				errorContext: {
					originalErrorMessage: "0",
				},
			});
		});

		it("classifies network-related errors as NETWORK_ERROR", () => {
			const error = new Error("Network request failed");
			createErrorResponse(error);
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining("(Type: NETWORK_ERROR)"),
			);
		});

		it("classifies validation errors as VALIDATION_ERROR", () => {
			const error = new Error("Validation failed: required field missing");
			createErrorResponse(error);
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining("(Type: VALIDATION_ERROR)"),
			);
		});

		it("classifies not found errors as NOT_FOUND", () => {
			const error = new Error("Resource not found");
			createErrorResponse(error);
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining("(Type: NOT_FOUND)"),
			);
		});

		it("classifies API errors as API_ERROR", () => {
			const error = new Error("API server error 500");
			createErrorResponse(error);
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining("(Type: API_ERROR)"),
			);
		});

		it("does not log raw axios request credentials", () => {
			const secret = "fixture-only-secret";
			createErrorResponse({
				isAxiosError: true,
				message: "Request failed with status code 404",
				config: {
					headers: { "api-key": secret },
					url: "/v1/workouts/missing",
				},
				response: { status: 404, data: { error: "not found" } },
			});

			expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
				secret,
			);
		});
	});

	describe("withErrorHandling", () => {
		beforeEach(() => {
			vi.clearAllMocks();
			vi.spyOn(console, "error").mockImplementation(() => {});
		});

		it("returns successful handler results unchanged", async () => {
			const response = {
				content: [{ type: "text" as const, text: "Success" }],
			};
			const handler = vi.fn().mockResolvedValue(response);

			const result = await withErrorHandling(
				handler,
				"TestContext",
			)({
				param: "test",
			});

			expect(result).toBe(response);
			expect(handler).toHaveBeenCalledWith({ param: "test" });
			expect(Sentry.captureException).not.toHaveBeenCalled();
		});

		it("normalizes nullish arguments to an empty object", async () => {
			const handler = vi.fn().mockResolvedValue({ content: [] });
			const wrapped = withErrorHandling(handler, "NullArgsContext");

			await Reflect.apply(wrapped, undefined, [null]);

			expect(handler).toHaveBeenCalledWith({});
		});

		it("captures and formats thrown errors", async () => {
			const error = new Error("Function error");
			const handler = vi.fn().mockRejectedValue(error);

			const result = await withErrorHandling(
				handler,
				"ErrorTest",
			)({
				param: "test",
			});

			expect(result).toMatchObject({
				isError: true,
				content: [{ type: "text", text: "[ErrorTest] Error: Function error" }],
				errorContext: {
					sourceContext: "ErrorTest",
					originalErrorMessage: "Function error",
				},
			});
			expect(testDoubles.scope.setTag).toHaveBeenCalledWith(
				"mcp.tool.context",
				"ErrorTest",
			);
			expect(testDoubles.scope.setContext).toHaveBeenCalledWith("mcpTool", {
				context: "ErrorTest",
				argumentKeyCount: 1,
			});
			expect(Sentry.captureException).toHaveBeenCalledWith(error);
		});

		it("captures and formats rejected non-Error values", async () => {
			const handler = vi.fn().mockRejectedValue(42);

			const result = await withErrorHandling(handler, "NumberErrorTest")({});

			expect(result).toMatchObject({
				isError: true,
				content: [{ type: "text", text: "[NumberErrorTest] Error: 42" }],
			});
			expect(Sentry.captureException).toHaveBeenCalledWith(42);
		});

		it("preserves axios-specific formatted responses", async () => {
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
			const handler = vi.fn().mockRejectedValue(axiosLikeError);

			const result = await withErrorHandling(handler, "AxiosContext")({});

			expect(result).toMatchObject({ isError: true });
			expect(result.content[0]?.text).toContain("service unavailable");
			expect(result.content[0]?.text).toContain("E_SERVICE_UNAVAILABLE");
			expect(Sentry.captureException).toHaveBeenCalledWith(axiosLikeError);
		});
	});
});
