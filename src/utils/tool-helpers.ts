/**
 * Type-safe utilities for MCP tool handlers
 */

import { z } from "zod";
import type { McpToolResponse } from "./response-formatter.js";

/**
 * Infer TypeScript types from Zod schema objects
 *
 * @example
 * ```typescript
 * const schema = {
 *   page: z.number(),
 *   pageSize: z.number(),
 * } as const;
 *
 * type Params = InferToolParams<typeof schema>; // { page: number; pageSize: number }
 * ```
 */
export type InferToolParams<T extends Record<string, z.ZodTypeAny>> = z.infer<
	z.ZodObject<T>
>;

/**
 * Create a type-safe tool handler that validates and narrows args to inferred types
 *
 * This function wraps a handler with automatic Zod validation, ensuring runtime
 * type safety while maintaining compile-time type inference.
 *
 * @param schema - Zod schema object (e.g., { page: z.number(), ... })
 * @param handler - Handler function that receives validated, typed parameters
 * @returns A handler function that accepts Record<string, unknown> and validates it
 *
 * @example
 * ```typescript
 * const schema = {
 *   page: z.coerce.number().int().gte(1).default(1),
 *   pageSize: z.coerce.number().int().gte(1).lte(10).default(5),
 * } as const;
 *
 * const handler = createTypedToolHandler(schema, async (args) => {
 *   // args is fully typed as { page: number; pageSize: number }
 *   const { page, pageSize } = args;
 *   // ...
 * });
 * ```
 */
export function createTypedToolHandler<T extends Record<string, z.ZodTypeAny>>(
	schema: T,
	handler: (args: InferToolParams<T>) => Promise<McpToolResponse>,
): (args: Record<string, unknown>) => Promise<McpToolResponse> {
	const zodSchema = z.object(schema);
	return async (args: Record<string, unknown>) => {
		const validated = zodSchema.parse(args);
		return handler(validated);
	};
}
