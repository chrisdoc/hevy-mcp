import type {
	CallToolResult,
	TextContent,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * MCP tool response type aligned with MCP SDK CallToolResult while keeping
 * content narrowed to text blocks for this server.
 */
export type McpToolResponse = Omit<CallToolResult, "content"> & {
	content: TextContent[];
};

export type StructuredMcpToolResponse<T extends Record<string, unknown>> =
	McpToolResponse & {
		structuredContent: T;
	};

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
	const jsonString =
		(options.pretty
			? JSON.stringify(data, null, options.indent)
			: JSON.stringify(data)) ?? "null";

	return {
		content: [
			{
				type: "text",
				text: jsonString,
			},
		],
	};
}

/**
 * Create a JSON text response with a typed machine-readable payload.
 *
 * The text content is produced by the legacy JSON formatter so existing MCP
 * clients receive byte-for-byte identical output.
 */
export function createStructuredJsonResponse<T extends Record<string, unknown>>(
	data: unknown,
	structuredContent: T,
	options: JsonFormatOptions = { pretty: true, indent: 2 },
): StructuredMcpToolResponse<T> {
	return {
		...createJsonResponse(data, options),
		structuredContent,
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
				type: "text",
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
	return createTextResponse(message);
}

/**
 * Create an empty/not-found text response with a valid structured payload.
 */
export function createStructuredEmptyResponse<
	T extends Record<string, unknown>,
>(message: string, structuredContent: T): StructuredMcpToolResponse<T> {
	return {
		...createEmptyResponse(message),
		structuredContent,
	};
}
