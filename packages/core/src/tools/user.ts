import type { UserInfo } from "@hevy-mcp/hevy-client/types";
import type { ToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";
import { userResponse } from "../utils/response-contracts.js";
import { readOnlyAnnotations } from "../utils/tool-annotations.js";
import { HevyOperationsService } from "../effect-services.js";
import { operationEffect, requireOperation } from "./operation-helpers.js";

const getUserInfoSchema = {} as const;

const getUserInfoDefinition: ToolDefinition<
	typeof getUserInfoSchema,
	UserInfo | undefined
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
	execute: (runtime: ToolRuntime) =>
		operationEffect(
			requireOperation(
				runtime.service(HevyOperationsService).user?.get,
				"user.get",
			),
			runtime.execution,
		),
};

export const userToolDefinitions = [getUserInfoDefinition] as const;
