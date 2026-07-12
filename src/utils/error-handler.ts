/**
 * Centralized error handling utility for MCP tools
 */

import { determineErrorType, ErrorType } from "./error-classification.js";
import { type HevyHttpError, isHevyHttpError } from "./hevy-http-error.js";
import type { McpToolResponse } from "./response-formatter.js";
import { createSafeErrorDiagnostic } from "./safe-error-diagnostic.js";
import { HEVY_CLIENT_NOT_INITIALIZED_ERROR } from "./tool-helpers.js";

export { ErrorType } from "./error-classification.js";

/**
 * Standard error response interface
 */
export interface ErrorResponse {
	message: string;
	code?: string;
	details?: unknown;
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

function getRateLimitMessage(error: HevyHttpError): string {
	const retryAfterHeader = getHeaderValue(error.headers, "retry-after");
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
	if (
		error instanceof Error &&
		error.message === HEVY_CLIENT_NOT_INITIALIZED_ERROR
	) {
		return HEVY_CLIENT_NOT_INITIALIZED_ERROR;
	}

	if (isRetryExhaustedError(error)) {
		return getRetryExhaustedMessage(error);
	}

	if (isHevyHttpError(error) && error.status === 429) {
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

/** Structured debug context containing only bounded, safe metadata. */
export interface ErrorDebugContext {
	sourceContext?: string;
	originalErrorMessage: string;
	errorCode?: string;
	errorType: ErrorType;
	axios?: {
		status?: number;
		statusText?: string;
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
	let errorMessage = "The request failed unexpectedly. Please try again.";
	const safeDiagnostic = createSafeErrorDiagnostic(error);
	const axiosErrorContext: ErrorDebugContext["axios"] | null =
		safeDiagnostic.status !== undefined ||
		safeDiagnostic.method !== undefined ||
		safeDiagnostic.endpoint !== undefined
			? {
					status: safeDiagnostic.status,
					method: safeDiagnostic.method,
					url: safeDiagnostic.endpoint,
				}
			: null;
	const mappedHevyErrorMessage = mapHevyErrorMessageByStatus(
		axiosErrorContext?.status,
	);

	if (mappedHevyErrorMessage) {
		errorMessage = mappedHevyErrorMessage;
	} else if (isHevyHttpError(error) && error.status !== undefined) {
		errorMessage = `Hevy API request failed (HTTP ${error.status}).`;
	}

	errorMessage = getUserFacingMessage(error, errorMessage);

	// Extract error code if available (for logging purposes)
	const errorCode = safeDiagnostic.code;

	// Determine error type based on error characteristics
	const errorType = determineErrorType(error, errorMessage);
	const errorContext: ErrorDebugContext = {
		sourceContext: context,
		originalErrorMessage: `${safeDiagnostic.category} occurred`,
		errorCode,
		errorType,
		axios: axiosErrorContext ?? undefined,
	};

	const contextPrefix = context ? `[${context}] ` : "";
	const formattedMessage = `${contextPrefix}Error: ${errorMessage}`;

	console.error("MCP tool failure", safeDiagnostic);

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

/**
 * Wrap an async function with standardized error handling
 *
 * This function preserves the parameter types of the wrapped function while
 * providing error handling.
 *
 * @param fn - The async function to wrap
 * @param context - Context information for error messages
 * @returns A function that catches errors and returns standardized error responses
 */
export function withErrorHandling<
	TParams extends Record<string, unknown>,
	TResponse extends McpToolResponse,
>(
	fn: (args: TParams) => Promise<TResponse>,
	context: string,
	onError?: (error: unknown, context: string, argumentKeyCount: number) => void,
): (args: TParams) => Promise<McpToolResponse> {
	return async (args: TParams) => {
		try {
			return await fn(args);
		} catch (error) {
			try {
				const argumentKeyCount = args == null ? 0 : Object.keys(args).length;
				onError?.(error, context, argumentKeyCount);
			} catch {
				console.error("MCP error observer failure", {
					category: "ObserverError",
				});
			}

			return createErrorResponse(error, context);
		}
	};
}
