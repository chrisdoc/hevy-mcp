/**
 * Centralized error handling utility for MCP tools
 */

import { SpanStatusCode } from "@opentelemetry/api";
import { isAxiosError } from "axios";
import { Sentry, tracer, getCurrentUserId } from "./telemetry.js";
import { toolInvocations, toolErrors, toolDuration } from "./metrics.js";
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
		const value = (headers as { get: (headerName: string) => unknown }).get(
			key,
		);
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
		return "Rate limited by Hevy (HTTP 429). Please wait and retry your request.";
	}

	const seconds = Number(retryAfterHeader);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return `Rate limited by Hevy (HTTP 429). Please wait about ${formatSecondsLabel(seconds)} before retrying.`;
	}

	const retryAtMillis = Date.parse(retryAfterHeader);
	if (!Number.isNaN(retryAtMillis)) {
		const secondsUntilRetry = Math.ceil(
			Math.max(0, retryAtMillis - Date.now()) / 1000,
		);
		return `Rate limited by Hevy (HTTP 429). Please wait about ${formatSecondsLabel(secondsUntilRetry)} before retrying.`;
	}

	return "Rate limited by Hevy (HTTP 429). Please wait and retry your request.";
}

function isRetryExhaustedError(error: unknown): boolean {
	return (
		!!error &&
		typeof error === "object" &&
		(error as RetryAwareError).hevyRetryExhausted === true
	);
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
		return `Unable to complete the request after ${attemptCount} attempts to the Hevy API due to transient failures. Please try again shortly.`;
	}

	return "Unable to complete the request after multiple attempts to the Hevy API due to transient failures. Please try again shortly.";
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

	errorMessage = getUserFacingMessage(error, errorMessage);

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

/** Whitelist of safe argument keys that can be logged as span attributes without exposing PII. */
const ARGUMENT_WHITELIST = new Set([
	"page",
	"pageSize",
	"since",
	"workoutId",
	"routineId",
	"folderId",
	"exerciseTemplateId",
	"date",
	"startDate",
	"endDate",
	"updatedSince",
	"includeCustom",
	"limit",
	"offset",
	"refresh",
	"query",
	"primaryMuscleGroup",
]);

/**
 * Extract safe (non-PII) parameters from the tool arguments to include as span attributes.
 */
function extractSafeArgs(
	args: Record<string, unknown>,
): Record<string, string | number | boolean> {
	const attributes: Record<string, string | number | boolean> = {};
	for (const [key, value] of Object.entries(args)) {
		if (ARGUMENT_WHITELIST.has(key)) {
			const type = typeof value;
			if (type === "string" || type === "number" || type === "boolean") {
				if (key === "query" && type === "string") {
					const strVal = value as string;
					attributes[`mcp.tool.args.${key}`] =
						strVal.length > 100 ? `${strVal.slice(0, 100)}...` : strVal;
				} else {
					attributes[`mcp.tool.args.${key}`] = value as
						| string
						| number
						| boolean;
				}
			}
		}
	}
	return attributes;
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
	return async (rawArgs: Record<string, unknown>) => {
		const args = rawArgs ?? {};
		const argumentKeys = Object.keys(args);
		const argumentKeyCount = argumentKeys.length;
		const startTime = Date.now();

		toolInvocations.add(1, { tool_name: context });

		const userId = getCurrentUserId();
		const safeArgs = extractSafeArgs(args);
		const whitelistedKeys = Object.keys(safeArgs).map((k) =>
			k.replace("mcp.tool.args.", ""),
		);

		return tracer.startActiveSpan(
			`mcp.tool.${context}`,
			{
				attributes: {
					"mcp.tool.name": context,
					"mcp.tool.args.key_count": argumentKeyCount,
					"mcp.tool.args.keys": whitelistedKeys.join(","),
					...(userId ? { "user.id": userId } : {}),
					...safeArgs,
				},
			},
			async (span) => {
				let isError = false;
				try {
					const result = await fn(args as TParams);
					isError = Boolean(result.isError);
					span.setStatus({
						code: isError ? SpanStatusCode.ERROR : SpanStatusCode.OK,
					});
					span.setAttribute("mcp.tool.result.is_error", isError);
					if (result.content) {
						span.setAttribute(
							"mcp.tool.result.content_count",
							result.content.length,
						);
						const textLength = result.content.reduce(
							(sum, item) => sum + (item.text?.length ?? 0),
							0,
						);
						span.setAttribute("mcp.tool.result.text_length", textLength);
					}
					return result;
				} catch (error) {
					isError = true;
					span.setStatus({ code: SpanStatusCode.ERROR });
					span.recordException(error as Error);

					const errorType = determineErrorType(
						error,
						error instanceof Error ? error.message : String(error),
					);

					span.setAttribute("error.type", errorType);

					const rawCode =
						error instanceof Error && "code" in error
							? (error as { code?: unknown }).code
							: undefined;
					if (rawCode !== undefined && rawCode !== null) {
						span.setAttribute("error.code", String(rawCode as string | number));
					}

					toolErrors.add(1, {
						tool_name: context,
						error_type: errorType,
					});

					Sentry.withScope((scope) => {
						scope.setTag("mcp.tool.context", context);
						scope.setContext("mcpTool", {
							context,
							argumentKeyCount,
						});
						Sentry.captureException(error);
					});

					return createErrorResponse(error, context);
				} finally {
					toolDuration.record(Date.now() - startTime, {
						tool_name: context,
						is_error: String(isError),
					});
					span.end();
				}
			},
		);
	};
}
