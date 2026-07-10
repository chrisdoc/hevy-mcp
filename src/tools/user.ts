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

export function registerUserTools(
	server: McpServer,
	hevyClient: HevyClient | null,
) {
	// Get user info
	const getUserInfoSchema = {} as const;
	type GetUserInfoParams = InferToolParams<typeof getUserInfoSchema>;

	server.registerTool(
		"get-user-info",
		{
			description:
				"Get the authenticated user's account info, including user ID, display name, and public profile URL. Useful for verifying which account the API key belongs to.",
			inputSchema: getUserInfoSchema,
			outputSchema: userOutputSchema,
			annotations: readOnlyAnnotations("Get User Info"),
		},
		withErrorHandling(async (_args: GetUserInfoParams) => {
			const client = requireClient(hevyClient);
			const data: UserInfoResponse = await client.getUserInfo();
			if (!data?.data) {
				return createStructuredEmptyResponse(
					"No user info found for the authenticated user",
					{ user: null },
				);
			}
			return createStructuredJsonResponse(data.data, { user: data.data });
		}, "get-user-info"),
	);
}
