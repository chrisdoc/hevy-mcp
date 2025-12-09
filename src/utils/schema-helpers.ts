import { type ZodRawShape, z } from "zod";

/**
 * Wraps a Zod schema shape into an object schema with `.passthrough()`.
 * This allows extra properties to pass through validation without causing errors.
 *
 * This is needed because some MCP clients (like n8n) send additional metadata
 * properties (e.g., 'action', 'chatInput', 'sessionId', 'toolCallId') with tool
 * calls that are not part of the tool's defined parameters.
 *
 * @param shape - The Zod raw shape (object with Zod schemas as values)
 * @returns A Zod object schema that allows unknown properties to pass through
 */
export function createPassthroughSchema<T extends ZodRawShape>(
	shape: T,
): z.ZodObject<T, "passthrough"> {
	return z.object(shape).passthrough();
}
