/**
 * Centralized error handling utility for MCP tools
 */

// Import the McpToolResponse type from response-formatter to ensure consistency
import * as Sentry from "@sentry/node";
import { isAxiosError } from "axios";
import type { McpToolResponse } from "./response-formatter.js";

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
 * Structured debug context that preserves original error details
 */
export interface ErrorDebugContext {
	sourceContext?: string;
	originalErrorMessage: string;
	errorCode?: string;
	errorType: ErrorType;
	axios?: {
		status?: number;
		statusText?: string;
		data?: unknown;
		method?: string;
		url?: string;
	};
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
	const originalErrorMessage = extractErrorMessage(error);
	let errorMessage = originalErrorMessage;
	const axiosErrorContext = extractAxiosErrorContext(error);
	const mappedHevyErrorMessage = mapHevyErrorMessageByStatus(
		axiosErrorContext?.status,
	);

	if (mappedHevyErrorMessage) {
		errorMessage = mappedHevyErrorMessage;
	}

	// Check for axios error with response data
	if (!mappedHevyErrorMessage && axiosErrorContext?.data) {
		errorMessage = stringifyErrorData(axiosErrorContext.data);
	}

	// Extract error code if available (for logging purposes)
	const errorCode =
		error instanceof Error && "code" in error
			? (error as { code?: string }).code
			: undefined;

	// Determine error type based on error characteristics
	const errorType = determineErrorType(error, errorMessage);
	const errorContext: ErrorDebugContext = {
		sourceContext: context,
		originalErrorMessage,
		errorCode,
		errorType,
		axios: axiosErrorContext ?? undefined,
	};

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
		errorContext,
	};
}

function extractErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === "string") {
		return error;
	}

	if (
		error &&
		typeof error === "object" &&
		"message" in error &&
		typeof error.message === "string"
	) {
		return error.message;
	}

	if (error && typeof error === "object") {
		try {
			return JSON.stringify(error);
		} catch (_e) {
			return "Unknown error object";
		}
	}

	return String(error);
}

function extractAxiosErrorContext(
	error: unknown,
): ErrorDebugContext["axios"] | null {
	if (!isAxiosError(error)) {
		return null;
	}

	return {
		status: error.response?.status,
		statusText: error.response?.statusText,
		data: error.response?.data,
		method: error.config?.method,
		url: error.config?.url,
	};
}

function mapHevyErrorMessageByStatus(status?: number): string | null {
	if (status === 401 || status === 403) {
		return "The Hevy API key is invalid or has expired. Check HEVY_API_KEY.";
	}

	if (status === 404) {
		return "The requested resource was not found in Hevy.";
	}

	if (status === 409) {
		return "A conflict occurred (e.g., a body measurement already exists for this date). Use the update tool instead.";
	}

	if (status === 422) {
		return "The request failed Hevy validation. Check the field values and try again.";
	}

	if (status === 429) {
		return "Rate limited by Hevy. Please wait and retry.";
	}

	if (status && status >= 500 && status <= 599) {
		return "Hevy API experienced an error. Please retry later.";
	}

	return null;
}

function stringifyErrorData(data: unknown): string {
	if (typeof data === "string") {
		return data;
	}

	if (data && typeof data === "object") {
		try {
			return JSON.stringify(data);
		} catch (_e) {
			return "Unable to serialize error response data";
		}
	}

	return String(data);
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
					Sentry.withScope((scope) => {
						scope.setTag("mcp.tool.context", context);
						scope.setContext("mcpTool", {
							context,
							argumentKeyCount,
						});
						Sentry.captureException(error);
					});

					return createErrorResponse(error, context);
				}
			},
		);
	};
}
