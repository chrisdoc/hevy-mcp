/**
 * Shared MCP tool annotation factories.
 *
 * All hevy-mcp tools talk to the Hevy API, a closed, fully specified domain
 * limited to the authenticated user's own data, so openWorldHint is false
 * across the board.
 */

import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/** Read-only tools (get-*, search-*): no side effects. */
export function readOnlyAnnotations(title: string): ToolAnnotations {
	return { title, readOnlyHint: true, openWorldHint: false };
}

/** Create tools (create-*): additive writes, repeating creates duplicates. */
export function createAnnotations(title: string): ToolAnnotations {
	return {
		title,
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: false,
	};
}

/**
 * Update tools (update-*): PUT-style overwrites that replace prior data,
 * hence destructive; repeating the same call yields the same state.
 */
export function updateAnnotations(title: string): ToolAnnotations {
	return {
		title,
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	};
}

/** Delete tools (delete-*): destructive and idempotent. */
export function destructiveAnnotations(title: string): ToolAnnotations {
	return {
		title,
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: false,
	};
}
