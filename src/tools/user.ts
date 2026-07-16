import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { UserInfoResponse } from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import type { HevyClient } from "../utils/hevyClient.js";
import { respond, userResponse } from "../utils/response-formatter.js";
import { describeTool, readOnlyAnnotations } from "../utils/tool-definition.js";
import { requireClient, type InferToolParams } from "../utils/tool-helpers.js";

export function registerUserTools(
	server: McpServer,
	hevyClient: HevyClient | null,
	wrapHandler: typeof withErrorHandling = withErrorHandling,
) {
	// Get user info
	const getUserInfoSchema = {} as const;
	type GetUserInfoParams = InferToolParams<typeof getUserInfoSchema>;

	server.registerTool(
		"get-user-info",
		{
			description: describeTool({
				summary:
					"Read-only. Returns the authenticated account's user ID, display name, and public profile URL.",
				aliases: ["who am I", "account info", "verify Hevy user"],
				useCase:
					"Use to confirm which Hevy account is connected before reading or writing account data.",
				importantNotes:
					"Accepts no inputs and reports only the account associated with the configured credentials.",
			}),
			inputSchema: getUserInfoSchema,
			outputSchema: userResponse.outputSchema,
			annotations: readOnlyAnnotations("Get User Info"),
		},
		wrapHandler(async (_args: GetUserInfoParams) => {
			const client = requireClient(hevyClient);
			const data: UserInfoResponse = await client.getUserInfo();
			return respond(userResponse, data?.data);
		}, "get-user-info"),
	);
}
