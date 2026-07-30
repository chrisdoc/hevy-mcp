import type { UserInfoResponse } from "@hevy-mcp/hevy-client/types";
import type { ToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";
import { userResponse } from "../utils/response-contracts.js";
import { readOnlyAnnotations } from "../utils/tool-annotations.js";

const getUserInfoSchema = {} as const;

const getUserInfoDefinition: ToolDefinition<
	typeof getUserInfoSchema,
	UserInfoResponse["data"]
> = {
	name: "get-user-info",
	feature: "profile",
	operation: "get",
	description:
		"Read-only. Returns the authenticated Hevy user ID, display name, and public profile URL.",
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
