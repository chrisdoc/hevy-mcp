/**
 * Centralized error handling utility for MCP tools
 */

import { ErrorType, resolveErrorPolicy } from "./error-policy.js";
import type { McpToolResponse } from "./response-formatter.js";
import { HEVY_CLIENT_NOT_INITIALIZED_ERROR } from "./tool-helpers.js";

export { ErrorType } from "./error-policy.js";

/**
 * Standard error response interface
 */
export interface ErrorResponse {
	message: string;
	code?: string;
	details?: unknown;
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
	const policy = resolveErrorPolicy(
		error,
		"The request failed unexpectedly. Please try again.",
		HEVY_CLIENT_NOT_INITIALIZED_ERROR,
	);
	const { diagnostic } = policy;
	const axiosErrorContext: ErrorDebugContext["axios"] | null =
		diagnostic.status !== undefined ||
		diagnostic.method !== undefined ||
		diagnostic.endpoint !== undefined
			? {
					status: diagnostic.status,
					method: diagnostic.method,
					url: diagnostic.endpoint,
				}
			: null;
	const errorContext: ErrorDebugContext = {
		sourceContext: context,
		originalErrorMessage: `${diagnostic.category} occurred`,
		errorCode: diagnostic.code,
		errorType: policy.type,
		axios: axiosErrorContext ?? undefined,
	};
	const contextPrefix = context ? `[${context}] ` : "";
	const formattedMessage = `${contextPrefix}Error: ${policy.message}`;

	console.error("MCP tool failure", diagnostic);

	return {
		content: [{ type: "text" as const, text: formattedMessage }],
		isError: true,
		errorContext,
	};
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
	onError?: (error: unknown, context: string, argumentKeyCount: number) => void,
): (args: Record<string, unknown>) => Promise<McpToolResponse> {
	return async (rawArgs: Record<string, unknown>) => {
		const args = rawArgs ?? {};
		try {
			return await fn(args as TParams);
		} catch (error) {
			try {
				onError?.(error, context, Object.keys(args).length);
			} catch {
				console.error("MCP error observer failure", {
					category: "ObserverError",
				});
			}

			return createErrorResponse(error, context);
		}
	};
}
