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

	// Include error code in logs if available
	if (errorCode) {
		console.debug(`Error code: ${errorCode}`);
	}

	const contextPrefix = context ? `[${context}] ` : "";
	const formattedMessage = `${contextPrefix}Error: ${errorMessage}`;

	// Log the error for server-side debugging
	console.error(formattedMessage, error);

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
