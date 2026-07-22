import type { UserInfoResponse } from "@hevy-mcp/hevy-client/types";
import type { ToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";
import { userResponse } from "../utils/response-formatter.js";
import { readOnlyAnnotations } from "../utils/tool-annotations.js";
import { describeTool } from "../utils/tool-descriptions.js";

const getUserInfoSchema = {} as const;

const getUserInfoDefinition: ToolDefinition<
	typeof getUserInfoSchema,
	UserInfoResponse["data"]
> = {
	name: "get-user-info",
	feature: "profile",
	operation: "get",
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
	kind: "read",
	outputSchema: userResponse.outputSchema,
	annotations: readOnlyAnnotations("Get User Info"),
	responseContract: userResponse,
	execute: async (runtime: ToolRuntime) => {
		const data: UserInfoResponse = await runtime.getClient().getUserInfo();
		return data?.data;
	},
};

export const userToolDefinitions = [getUserInfoDefinition] as const;
