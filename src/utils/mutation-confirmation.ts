import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolResponse } from "./response-formatter.js";
import { createTextResponse } from "./response-formatter.js";

export interface MutationConfirmationOptions {
	autoConfirm?: boolean;
	message: string;
}

export interface MutationToolOptions {
	autoConfirm?: boolean;
}

export type MutationConfirmationResult =
	| { confirmed: true }
	| { confirmed: false; response: McpToolResponse };

const UNSUPPORTED_MESSAGE = [
	"This MCP client does not support form elicitation, so the requested change was not made.",
	"For intentional automation, set HEVY_MCP_AUTO_CONFIRM=1 or start hevy-mcp with --yes.",
].join(" ");

const CANCELED_MESSAGE = "Mutation canceled. No changes were made.";

/**
 * Require explicit user confirmation before a mutating Hevy operation.
 *
 * The guard fails closed when form elicitation is unavailable. Transport and
 * protocol errors intentionally propagate to the tool's existing error wrapper.
 */
export async function confirmMutation(
	server: McpServer,
	options: MutationConfirmationOptions,
): Promise<MutationConfirmationResult> {
	if (options.autoConfirm === true) {
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
