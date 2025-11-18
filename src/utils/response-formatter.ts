/**
 * MCP Tool Response type
 */
export interface McpToolResponse {
	[x: string]: unknown;
	content: Array<{
		type: "text";
		text: string;
	}>;
}

/**
 * Format options for JSON responses
 */
export interface JsonFormatOptions {
	/** Whether to pretty-print the JSON with indentation */
	pretty?: boolean;
	/** Indentation spaces for pretty-printing (default: 2) */
	indent?: number;
}

/**
 * Create a standardized success response with JSON data
 *
 * @param data - The data to include in the response
 * @param options - Formatting options
 * @returns A formatted MCP tool response with the data as JSON
 */
export function createJsonResponse(
	data: unknown,
	options: JsonFormatOptions = { pretty: true, indent: 2 },
): McpToolResponse {
	const jsonString = options.pretty
		? JSON.stringify(data, null, options.indent)
		: JSON.stringify(data);

	return {
		content: [
			{
				type: "text" as const,
				text: jsonString,
			},
		],
	};
}

/**
 * Create a standardized success response with text data
 *
 * @param message - The text message to include in the response
 * @returns A formatted MCP tool response with the text message
 */
export function createTextResponse(message: string): McpToolResponse {
	return {
		content: [
			{
				type: "text" as const,
				text: message,
			},
		],
	};
}

/**
 * Create a standardized success response for empty or null results
 *
 * @param message - Optional message to include (default: "No data found")
 * @returns A formatted MCP tool response for empty results
 */
export function createEmptyResponse(
	message = "No data found",
): McpToolResponse {
	return {
		content: [
			{
				type: "text" as const,
				text: message,
			},
		],
	};
}
