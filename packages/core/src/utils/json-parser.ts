/**
 * Preprocessor to handle MCP clients that send JSON-stringified arrays
 * instead of native arrays for complex parameters.
 *
 * This is used with Zod's z.preprocess to handle cases where MCP clients
 * serialize complex nested structures as JSON strings.
 *
 * @param val - The value to potentially parse
 * @returns The parsed array if val is a valid JSON string, otherwise returns val unchanged
 */
export function parseJsonArray(val: unknown): unknown {
	// Handle case where MCP client sends JSON string instead of array
	if (typeof val === "string") {
		try {
			return JSON.parse(val);
		} catch {
			// Let Zod validation handle the error
			return val;
		}
	}
	return val;
}
