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
	RATE_LIMIT = "RATE_LIMIT",
	VALIDATION_ERROR = "VALIDATION_ERROR",
	NOT_FOUND = "NOT_FOUND",
	NETWORK_ERROR = "NETWORK_ERROR",
	UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

type RetryAwareError = {
	hevyRetryCount?: number;
	hevyRetryExhausted?: boolean;
};

function normalizeHeaderValue(value: unknown): string | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}

	if (Array.isArray(value) && value.length > 0) {
		return normalizeHeaderValue(value[0]);
	}

	return undefined;
}

function getHeaderValue(headers: unknown, key: string): string | undefined {
	if (!headers || typeof headers !== "object") {
		return undefined;
	}

	if (
		"get" in headers &&
		typeof (headers as { get?: unknown }).get === "function"
	) {
		const value = (
			headers as {
				get: (headerName: string) => unknown;
			}
		).get(key);
		return normalizeHeaderValue(value);
	}

	const headerRecord = headers as Record<string, unknown>;
	return normalizeHeaderValue(
		headerRecord[key] ??
			headerRecord[key.toLowerCase()] ??
			headerRecord[key.toUpperCase()],
	);
}

function formatSecondsLabel(seconds: number): string {
	const roundedSeconds = Math.max(0, Math.round(seconds));
	const suffix = roundedSeconds === 1 ? "" : "s";
	return `${roundedSeconds} second${suffix}`;
}

function getRateLimitMessage(error: unknown): string {
	if (!isAxiosError(error)) {
		return "Rate limited by Hevy. Please wait and retry.";
	}

	const retryAfterHeader = getHeaderValue(
		error.response?.headers,
		"retry-after",
	);
	if (!retryAfterHeader) {
		return (
			"Rate limited by Hevy (HTTP 429). " +
			"Please wait and retry your request."
		);
	}

	const seconds = Number(retryAfterHeader);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return (
			"Rate limited by Hevy (HTTP 429). " +
			`Please wait about ${formatSecondsLabel(seconds)} before retrying.`
		);
	}

	const retryAtMillis = Date.parse(retryAfterHeader);
	if (!Number.isNaN(retryAtMillis)) {
		const secondsUntilRetry = Math.ceil(
			Math.max(0, retryAtMillis - Date.now()) / 1000,
		);
		return (
			"Rate limited by Hevy (HTTP 429). " +
			`Please wait about ${formatSecondsLabel(
				secondsUntilRetry,
			)} before retrying.`
		);
	}

	return (
		"Rate limited by Hevy (HTTP 429). " + "Please wait and retry your request."
	);
}

function isRetryExhaustedError(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const retryAwareError = error as RetryAwareError;
	return retryAwareError.hevyRetryExhausted === true;
}

function getRetryExhaustedMessage(error: unknown): string {
	const retryCount =
		typeof error === "object" && error !== null
			? (error as RetryAwareError).hevyRetryCount
			: undefined;
	const attemptCount =
		typeof retryCount === "number" && Number.isFinite(retryCount)
			? retryCount + 1
			: undefined;

	if (attemptCount) {
		return (
			`Unable to complete the request after ${attemptCount} attempts ` +
			"to the Hevy API due to transient failures. " +
			"Please try again shortly."
		);
	}

	return (
		"Unable to complete the request after multiple attempts " +
		"to the Hevy API due to transient failures. " +
		"Please try again shortly."
	);
}

function getUserFacingMessage(error: unknown, defaultMessage: string): string {
	if (isRetryExhaustedError(error)) {
		return getRetryExhaustedMessage(error);
	}

	if (isAxiosError(error) && error.response?.status === 429) {
		return getRateLimitMessage(error);
	}

	return defaultMessage;
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
	let baseErrorMessage = error instanceof Error ? error.message : String(error);

	// Check for axios error with response data
	if (isAxiosError(error) && error.response?.data) {
		const { data } = error.response;
		if (typeof data === "string") {
			baseErrorMessage = data;
		} else if (data && typeof data === "object") {
			try {
				baseErrorMessage = JSON.stringify(data);
			} catch (_e) {
				baseErrorMessage = String(data);
			}
		}
	}

	const errorMessage = getUserFacingMessage(error, baseErrorMessage);

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
	if (isRetryExhaustedError(error)) {
		return ErrorType.NETWORK_ERROR;
	}

	if (isAxiosError(error) && error.response?.status === 429) {
		return ErrorType.RATE_LIMIT;
	}

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
