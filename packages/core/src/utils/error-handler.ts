/**
 * Centralized error handling utility for MCP tools
 */

import { ErrorType, resolveErrorPolicy } from "./error-policy.js";
import type { JSONObject } from "@modelcontextprotocol/server";
import type { McpToolResponse } from "./response-contracts.js";
import { HEVY_CLIENT_NOT_INITIALIZED_ERROR } from "./tool-helpers.js";
import {
	createExecutionProjection,
	type StructuredExecutionProjection,
	type ToolExecutionContext,
} from "../execution.js";
import { createSafeErrorDiagnostic } from "./safe-error-diagnostic.js";
import type { RuntimeValue } from "./type-predicates.js";

export { ErrorType } from "./error-policy.js";
export type { StructuredExecutionError } from "../execution.js";

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

/** Build the canonical execution projection for an arbitrary thrown value. */
export function createExecutionErrorProjection(
	error: RuntimeValue,
): StructuredExecutionProjection {
	return createExecutionProjection(createSafeErrorDiagnostic(error));
}

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
	type MutableFailureEvent = {
		-readonly [K in keyof McpToolFailureEvent]: McpToolFailureEvent[K];
	};
	const event: MutableFailureEvent = {
		event: "mcp.tool.failure",
		"mcp.tool.name": toolName,
		"error.type": errorType,
		"error.category": diagnostic.category,
	};
	if (diagnostic.code) event["error.code"] = diagnostic.code;
	if (diagnostic.status !== undefined)
		event["http.status_code"] = diagnostic.status;
	if (diagnostic.method) event["http.method"] = diagnostic.method;
	if (diagnostic.endpoint) event["hevy.api.endpoint"] = diagnostic.endpoint;
	if (execution) {
		event["hevy.api.outcome"] = execution.outcome;
		event["hevy.api.phase"] = execution.phase;
		event["hevy.api.operation_safety"] = execution.operation_safety;
		event["hevy.api.commit_state"] = execution.commit_state;
		event["hevy.api.safe_to_retry"] = execution.safe_to_retry;
	}
	return event;
}

/** Structured debug context containing only bounded, safe metadata. */
export interface ErrorDebugContext {
	sourceContext?: string;
	originalErrorMessage: string;
	errorCode?: string;
	errorType: ErrorType;
	execution?: StructuredExecutionProjection;
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
	error: RuntimeValue,
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
export function withErrorHandling<TParams extends object>(
	fn: (
		args: TParams,
		context?: ToolExecutionContext,
	) => Promise<McpToolResponse>,
	context: string,
	onError?: (
		error: RuntimeValue,
		context: string,
		argumentKeyCount: number,
	) => void,
): (
	args: JSONObject,
	context?: ToolExecutionContext,
) => Promise<McpToolResponse> {
	return async (rawArgs: JSONObject, requestContext?: ToolExecutionContext) => {
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
