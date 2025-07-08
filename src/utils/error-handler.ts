/**
 * Centralized error handling utility for MCP tools
 */

// Define the McpToolResponse interface based on the SDK's structure
interface McpToolResponse {
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
}

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
	const errorMessage = error instanceof Error ? error.message : String(error);
	// Extract error code if available (for logging purposes)
	const errorCode =
		error instanceof Error && "code" in error
			? (error as { code?: string }).code
			: undefined;

	// Determine error type based on error characteristics
	const errorType = determineErrorType(error, errorMessage);

	// Include error code in logs if available
	if (errorCode) {
		console.debug(`Error code: ${errorCode}`);
	}

	const contextPrefix = context ? `[${context}] ` : "";
	const formattedMessage = `${contextPrefix}Error: ${errorMessage}`;

	// Log the error for server-side debugging with type information
	console.error(`${formattedMessage} (Type: ${errorType})`, error);

	return {
		content: [
			{
				type: "text",
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

/**
 * Wrap an async function with standardized error handling
 *
 * @param fn - The async function to wrap
 * @param context - Context information for error messages
 * @returns A function that catches errors and returns standardized error responses
 */
// Define a more specific type for function parameters
type McpToolFunction = (
	...args: Record<string, unknown>[]
) => Promise<McpToolResponse>;

/**
 * Wrap an async function with standardized error handling
 *
 * @param fn - The async function to wrap
 * @param context - Context information for error messages
 * @returns A function that catches errors and returns standardized error responses
 */
export function withErrorHandling<T extends McpToolFunction>(
	fn: T,
	context: string,
): T {
	return (async (...args: Parameters<T>) => {
		try {
			return await fn(...args);
		} catch (error) {
			return createErrorResponse(error, context);
		}
	}) as T;
}
