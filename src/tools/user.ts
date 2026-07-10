import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { UserInfoResponse } from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import {
	createEmptyResponse,
	createJsonResponse,
} from "../utils/response-formatter.js";
import { readOnlyAnnotations } from "../utils/tool-annotations.js";
import { requireClient, type InferToolParams } from "../utils/tool-helpers.js";
import { withTelemetry } from "../utils/telemetry-wrapper.js";

type HevyClient = ReturnType<
	typeof import("../utils/hevyClientKubb.js").createClient
>;

export function registerUserTools(
	server: McpServer,
	hevyClient: HevyClient | null,
) {
	// Get user info
	const getUserInfoSchema = {} as const;
	type GetUserInfoParams = InferToolParams<typeof getUserInfoSchema>;

	server.tool(
		"get-user-info",
		"Get the authenticated user's account info, including user ID, display name, and public profile URL. Useful for verifying which account the API key belongs to.",
		getUserInfoSchema,
		readOnlyAnnotations("Get User Info"),
		withErrorHandling(
			withTelemetry(async (_args: GetUserInfoParams) => {
				const client = requireClient(hevyClient);
				const data: UserInfoResponse = await client.getUserInfo();
				if (!data?.data) {
					return createEmptyResponse(
						"No user info found for the authenticated user",
					);
				}
				return createJsonResponse(data.data);
			}, "get-user-info"),
			"get-user-info",
		),
	);
}
