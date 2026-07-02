/**
 * Centralized error handling utility for MCP tools
 */

// Import the McpToolResponse type from response-formatter to ensure consistency
import * as Sentry from "@sentry/node";
import { isAxiosError } from "axios";
import type { McpToolResponse } from "./response-formatter.js";

const EXPECTED_AXIOS_STATUS_CODES = new Set([400, 401, 403, 404, 409]);

/**
 * Standard error response interface
 */
export interface ErrorResponse {
	message: string;
	code?: string;
	details?: unknown;
}

/**
 * Specific error types for better categorization
 */
export enum ErrorType {
	API_ERROR = "API_ERROR",
	VALIDATION_ERROR = "VALIDATION_ERROR",
	NOT_FOUND = "NOT_FOUND",
	NETWORK_ERROR = "NETWORK_ERROR",
	UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Enhanced error response with type categorization
 */
export interface EnhancedErrorResponse extends ErrorResponse {
	type: ErrorType;
}

/**
 * Create a standardized error response for MCP tools
 *
 * @param error - The error object or message
 * @param context - Optional context information about where the error occurred
 * @returns A formatted MCP tool response with error information
 */
export function createErrorResponse(
	error: unknown,
	context?: string,
): McpToolResponse {
	// Extract axios response data if available
	let errorMessage = error instanceof Error ? error.message : String(error);

	// Check for axios error with response data
	if (isAxiosError(error) && error.response?.data) {
		const { data } = error.response;
		if (typeof data === "string") {
			errorMessage = data;
		} else if (data && typeof data === "object") {
			try {
				errorMessage = JSON.stringify(data);
			} catch (_e) {
				errorMessage = String(data);
			}
		}
	}

	// Extract error code if available (for logging purposes)
	const errorCode =
		error instanceof Error && "code" in error
			? (error as { code?: string }).code
			: undefined;

	// Determine error type based on error characteristics
	const errorType = determineErrorType(error, errorMessage);

	const contextPrefix = context ? `[${context}] ` : "";
	const formattedMessage = `${contextPrefix}Error: ${errorMessage}`;
	const errorCodeSuffix = errorCode ? `, Code: ${errorCode}` : "";

	// Log the error for server-side debugging with type information
	console.error(
		`${formattedMessage} (Type: ${errorType}${errorCodeSuffix})`,
		error,
	);

	return {
		content: [
			{
				type: "text" as const,
				text: formattedMessage,
			},
		],
		isError: true,
	};
}

/**
 * Determine the type of error based on error characteristics
 */
function determineErrorType(error: unknown, message: string): ErrorType {
	const messageLower = message.toLowerCase();
	const nameLower = error instanceof Error ? error.name.toLowerCase() : "";

	if (
		nameLower.includes("network") ||
		messageLower.includes("network") ||
		nameLower.includes("fetch") ||
		messageLower.includes("fetch") ||
		nameLower.includes("timeout") ||
		messageLower.includes("timeout")
	) {
		return ErrorType.NETWORK_ERROR;
	}

	if (
		nameLower.includes("validation") ||
		messageLower.includes("validation") ||
		messageLower.includes("invalid") ||
		messageLower.includes("required")
	) {
		return ErrorType.VALIDATION_ERROR;
	}

	if (
		messageLower.includes("not found") ||
		messageLower.includes("404") ||
		messageLower.includes("does not exist")
	) {
		return ErrorType.NOT_FOUND;
	}

	if (
		nameLower.includes("api") ||
		messageLower.includes("api") ||
		messageLower.includes("server error") ||
		messageLower.includes("500")
	) {
		return ErrorType.API_ERROR;
	}

	return ErrorType.UNKNOWN_ERROR;
}

function isExpectedAxiosErrorForSentry(error: unknown): boolean {
	if (!isAxiosError(error)) {
		return false;
	}

	const status = error.response?.status;
	return typeof status === "number" && EXPECTED_AXIOS_STATUS_CODES.has(status);
}

function isExpectedJsonParseErrorForSentry(error: unknown): boolean {
	if (!(error instanceof SyntaxError)) {
		return false;
	}

	const message = error.message.toLowerCase();
	if (message.includes("unexpected end of json input")) {
		return true;
	}

	const hasJsonContext = message.includes("json");
	const looksLikeParseFailure =
		message.includes("unexpected token") ||
		message.includes("json parse") ||
		message.includes("is not valid json") ||
		message.includes("at position") ||
		message.includes("expected");

	return hasJsonContext && looksLikeParseFailure;
}

function shouldCaptureInSentry(error: unknown): boolean {
	if (isExpectedAxiosErrorForSentry(error)) {
		return false;
	}

	if (isExpectedJsonParseErrorForSentry(error)) {
		return false;
	}

	return true;
}

/**
 * Wrap an async function with standardized error handling
 *
 * This function preserves the parameter types of the wrapped function while
 * providing error handling. The returned function accepts Record<string, unknown>
 * (as required by MCP SDK) but internally casts to the original parameter type.
 *
 * @param fn - The async function to wrap
 * @param context - Context information for error messages
 * @returns A function that catches errors and returns standardized error responses
 */
export function withErrorHandling<TParams extends Record<string, unknown>>(
	fn: (args: TParams) => Promise<McpToolResponse>,
	context: string,
): (args: Record<string, unknown>) => Promise<McpToolResponse> {
	return async (args: Record<string, unknown>) => {
		const argumentKeyCount = Object.keys(args).length;

		return Sentry.startSpan(
			{
				name: `mcp.tool.${context}`,
				op: "mcp.tool.execute",
				attributes: {
					"mcp.tool.context": context,
					"mcp.tool.args.key_count": argumentKeyCount,
				},
			},
			async (span) => {
				try {
					const result = await fn(args as TParams);
					span.setStatus({ code: 1 });
					span.setAttribute(
						"mcp.tool.result.is_error",
						Boolean(result.isError),
					);
					return result;
				} catch (error) {
					span.setStatus({ code: 2, message: "tool_handler_error" });

					const shouldCapture = shouldCaptureInSentry(error);
					span.setAttribute("mcp.tool.error.capture_in_sentry", shouldCapture);

					if (shouldCapture) {
						Sentry.withScope((scope) => {
							scope.setTag("mcp.tool.context", context);
							scope.setContext("mcpTool", {
								context,
								argumentKeyCount,
							});
							Sentry.captureException(error);
						});
					}

					return createErrorResponse(error, context);
				}
			},
		);
	};
}
