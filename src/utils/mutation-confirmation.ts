import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolResponse } from "./response-formatter.js";
import { createTextResponse } from "./response-formatter.js";

export interface MutationConfirmationOptions {
	confirmMutations?: boolean;
	message: string;
}

export interface MutationToolOptions {
	confirmMutations?: boolean;
}

export type MutationConfirmationResult =
	| { confirmed: true }
	| { confirmed: false; response: McpToolResponse };

const UNSUPPORTED_MESSAGE = [
	"Mutation confirmation is enabled, but this MCP client does not support form elicitation, so the requested change was not made.",
	"Disable mutation confirmation or use a client with elicitation.form support.",
].join(" ");

const CANCELED_MESSAGE = "Mutation canceled. No changes were made.";

/**
 * Optionally require explicit user confirmation before a mutating Hevy operation.
 *
 * The guard fails closed when form elicitation is unavailable. Transport and
 * protocol errors intentionally propagate to the tool's existing error wrapper.
 */
export async function confirmMutation(
	server: McpServer,
	options: MutationConfirmationOptions,
): Promise<MutationConfirmationResult> {
	if (options.confirmMutations !== true) {
		return { confirmed: true };
	}

	const capabilities = server.server.getClientCapabilities();
	if (capabilities?.elicitation?.form === undefined) {
		return {
			confirmed: false,
			response: {
				...createTextResponse(UNSUPPORTED_MESSAGE),
				isError: true,
			},
		};
	}

	const result = await server.server.elicitInput({
		mode: "form",
		message: options.message,
		requestedSchema: {
			type: "object",
			properties: {
				confirm: {
					type: "boolean",
					title: "Confirm",
					default: false,
				},
			},
			required: ["confirm"],
		},
	});

	if (result.action === "accept" && result.content?.confirm === true) {
		return { confirmed: true };
	}

	return {
		confirmed: false,
		response: createTextResponse(CANCELED_MESSAGE),
	};
}
