import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

interface ToolDescriptionParts {
	summary: string;
	aliases: readonly string[];
	useCase: string;
	importantNotes: string;
}

export function describeTool({
	summary,
	aliases,
	useCase,
	importantNotes,
}: ToolDescriptionParts): string {
	return [
		summary,
		`Aliases: ${aliases.join(", ")}.`,
		`<use_case>${useCase}</use_case>`,
		`<important_notes>${importantNotes}</important_notes>`,
	].join(" ");
}

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

/**
 * Preprocessor for MCP clients that send JSON-stringified complex parameters.
 */
export function parseJsonArray(val: unknown): unknown {
	if (typeof val === "string") {
		try {
			return JSON.parse(val);
		} catch {
			// Let Zod validation handle the error.
			return val;
		}
	}
	return val;
}
