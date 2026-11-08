import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GetV1UserInfo200 } from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { formatUserInfo } from "../utils/formatters.js";
import type { HevyClient } from "../utils/hevyClient.js";
import {
	createEmptyResponse,
	createJsonResponse,
} from "../utils/response-formatter.js";

/**
 * Register user-related tools with the MCP server
 */
export function registerUserTools(
	server: McpServer,
	hevyClient: HevyClient | null,
) {
	server.tool(
		"get-user-info",
		"Get the authenticated Hevy user's profile: id, username, display name, public profile URL, preferred weight unit (kg or lbs), preferred distance unit (kilometers or miles), and whether they have Hevy Pro. The API always uses kg and meters, so use the preferred units to convert values shown to or entered by the user.",
		{},
		withErrorHandling(async () => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			const data: GetV1UserInfo200 = await hevyClient.getUserInfo();

			if (!data?.data) {
				return createEmptyResponse("User info not found");
			}

			return createJsonResponse(formatUserInfo(data.data), {
				pretty: true,
				indent: 2,
			});
		}, "get-user-info"),
	);
}
