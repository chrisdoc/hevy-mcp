/**
 * Centralized error handling utility for MCP tools
 */

import { ErrorType, resolveErrorPolicy } from "./error-policy.js";
import type { McpToolResponse } from "./response-contracts.js";
import { HEVY_CLIENT_NOT_INITIALIZED_ERROR } from "./tool-helpers.js";
import {
	createExecutionProjection,
	type StructuredExecutionProjection,
	type ToolExecutionContext,
} from "../execution.js";

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

export type StructuredExecutionError = StructuredExecutionProjection;
export interface McpToolFailureEvent {
	readonly event: "mcp.tool.failure";
	readonly "mcp.tool.name": string;
	readonly "error.type": ErrorType;
	readonly "error.category": string;
	readonly "error.code"?: string;
	readonly "http.status_code"?: number;
	readonly "http.method"?: string;
	readonly "hevy.api.endpoint"?: string;
	readonly "hevy.api.outcome"?: StructuredExecutionProjection["outcome"];
	readonly "hevy.api.phase"?: StructuredExecutionProjection["phase"];
	readonly "hevy.api.operation_safety"?: StructuredExecutionProjection["operation_safety"];
	readonly "hevy.api.commit_state"?: StructuredExecutionProjection["commit_state"];
	readonly "hevy.api.safe_to_retry"?: boolean;
}

export function createMcpToolFailureEvent(
	toolName: string,
	errorType: ErrorType,
	diagnostic: {
		category: string;
		code?: string;
		status?: number;
		method?: string;
		endpoint?: string;
		execution?: StructuredExecutionProjection;
	},
): McpToolFailureEvent {
	const execution = diagnostic.execution;
	return {
		event: "mcp.tool.failure",
		"mcp.tool.name": toolName,
		"error.type": errorType,
		"error.category": diagnostic.category,
		...(diagnostic.code ? { "error.code": diagnostic.code } : {}),
		...(diagnostic.status !== undefined
			? { "http.status_code": diagnostic.status }
			: {}),
		...(diagnostic.method ? { "http.method": diagnostic.method } : {}),
		...(diagnostic.endpoint
			? { "hevy.api.endpoint": diagnostic.endpoint }
			: {}),
		...(execution
			? {
					"hevy.api.outcome": execution.outcome,
					"hevy.api.phase": execution.phase,
					"hevy.api.operation_safety": execution.operation_safety,
					"hevy.api.commit_state": execution.commit_state,
					"hevy.api.safe_to_retry": execution.safe_to_retry,
				}
			: {}),
	};
}

/** Structured debug context containing only bounded, safe metadata. */
export interface ErrorDebugContext {
	sourceContext?: string;
	originalErrorMessage: string;
	errorCode?: string;
	errorType: ErrorType;
	execution?: StructuredExecutionError;
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
	const execution = createExecutionProjection(diagnostic);
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
		execution,
		axios: axiosErrorContext ?? undefined,
	};
	const contextPrefix = context ? `[${context}] ` : "";
	const formattedMessage = `${contextPrefix}Error: ${policy.message}`;
	console.error(
		JSON.stringify(
			createMcpToolFailureEvent(context || "unknown", policy.type, {
				...diagnostic,
				execution,
			}),
		),
	);

	return {
		content: [{ type: "text" as const, text: formattedMessage }],
		isError: true,
		errorContext,
		structuredContent: { error: execution },
		errorOutcome: execution,
	};
}

/**
 * Wrap an async function with standardized error handling
 *
 * @param fn - The async function to wrap
 * @param context - Context information for error messages
 * @returns A function that catches errors and returns standardized error responses
 */
export function withErrorHandling<TParams extends Record<string, unknown>>(
	fn: (
		args: TParams,
		context?: ToolExecutionContext,
	) => Promise<McpToolResponse>,
	context: string,
	onError?: (error: unknown, context: string, argumentKeyCount: number) => void,
): (
	args: Record<string, unknown>,
	context?: ToolExecutionContext,
) => Promise<McpToolResponse> {
	return async (
		rawArgs: Record<string, unknown>,
		requestContext?: ToolExecutionContext,
	) => {
		const normalizedArgs = rawArgs ?? {};
		try {
			return await fn(normalizedArgs as TParams, requestContext);
		} catch (error) {
			try {
				onError?.(error, context, Object.keys(normalizedArgs).length);
			} catch {
				console.error("MCP error observer failure", {
					category: "ObserverError",
				});
			}

			return createErrorResponse(error, context);
		}
	};
}
