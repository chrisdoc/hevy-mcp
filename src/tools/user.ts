import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { UserInfoResponse } from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import type { HevyClient } from "../utils/hevyClient.js";
import { userOutputSchema } from "../utils/output-schemas.js";
import {
	createStructuredEmptyResponse,
	createStructuredJsonResponse,
} from "../utils/response-formatter.js";
import { readOnlyAnnotations } from "../utils/tool-annotations.js";
import { requireClient, type InferToolParams } from "../utils/tool-helpers.js";
import { defineTool } from "./define-tool.js";

export function registerUserTools(
	server: McpServer,
	hevyClient: HevyClient | null,
	wrapHandler: typeof withErrorHandling = withErrorHandling,
) {
	// Get user info
	const getUserInfoSchema = {} as const;
	type GetUserInfoParams = InferToolParams<typeof getUserInfoSchema>;

	defineTool(server, {
		name: "get-user-info",
		description: {
			summary:
				"Read-only. Returns the authenticated account's user ID, display name, and public profile URL.",
			aliases: ["who am I", "account info", "verify Hevy user"],
			useCase:
				"Use to confirm which Hevy account is connected before reading or writing account data.",
			importantNotes:
				"Accepts no inputs and reports only the account associated with the configured credentials.",
		},
		inputSchema: getUserInfoSchema,
		outputSchema: userOutputSchema,
		annotations: readOnlyAnnotations("Get User Info"),
		wrapHandler,
		handler: async (_args: GetUserInfoParams) => {
			const client = requireClient(hevyClient);
			const data: UserInfoResponse = await client.getUserInfo();
			if (!data?.data) {
				return createStructuredEmptyResponse(
					"No user info found for the authenticated user",
					{ user: null },
				);
			}
			return createStructuredJsonResponse(data.data, { user: data.data });
		},
	});
}
