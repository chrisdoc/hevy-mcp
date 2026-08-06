// Import types from generated client
import type {
	GetV1RoutineFoldersFolderid200,
	PostV1RoutineFolders201,
} from "@hevy-mcp/hevy-client/types";
import type { ToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";
import {
	createRoutineFolderResponse,
	routineFolderResponse,
} from "../utils/response-contracts.js";
import {
	createAnnotations,
	readOnlyAnnotations,
} from "../utils/tool-annotations.js";

import type { InferToolParams } from "../utils/tool-helpers.js";
import { nonEmptyId, routineFolderInputShape } from "./input-schemas.js";
import { isExpectedReadNotFound } from "../utils/hevy-error-policy.js";

const getRoutineFolderSchema = { folder_id: nonEmptyId } as const;
type GetRoutineFolderParams = InferToolParams<typeof getRoutineFolderSchema>;

const createRoutineFolderSchema = routineFolderInputShape;
type CreateRoutineFolderParams = InferToolParams<
	typeof createRoutineFolderSchema
>;

const getRoutineFolderDefinition = {
	name: "get-routine-folder",
	feature: "folders" as const,
	operation: "get" as const,
	description:
		"Read-only. Gets one routine folder by folder_id. Use the hevy://routine-folders resource to discover IDs.",
	inputSchema: getRoutineFolderSchema,
	outputSchema: routineFolderResponse.outputSchema,
	annotations: readOnlyAnnotations("Get Routine Folder"),
	kind: "read" as const,
	responseContract: routineFolderResponse,
	execute: async (
		runtime: ToolRuntime,
		args: GetRoutineFolderParams,
	): Promise<{
		routine_folder: GetV1RoutineFoldersFolderid200 | null | undefined;
		folder_id: string;
		expected404Outcome?: "not_found";
	}> => {
		const { folder_id } = args;
		try {
			const data: GetV1RoutineFoldersFolderid200 | null = await runtime
				.getClient()
				.getRoutineFolder(folder_id);
			return { routine_folder: data, folder_id };
		} catch (error) {
			if (isExpectedReadNotFound(error)) {
				return {
					routine_folder: null,
					folder_id,
					expected404Outcome: "not_found",
				};
			}
			throw error;
		}
	},
} satisfies ToolDefinition<
	typeof getRoutineFolderSchema,
	{
		routine_folder: GetV1RoutineFoldersFolderid200 | null | undefined;
		folder_id: string;
		expected404Outcome?: "not_found";
	}
>;

const createRoutineFolderDefinition = {
	name: "create-routine-folder",
	feature: "folders" as const,
	operation: "create" as const,
	description:
		"Writes a routine folder. Retries or reused titles can create duplicates.",
	inputSchema: createRoutineFolderSchema,
	annotations: createAnnotations("Create Routine Folder"),
	kind: "write" as const,
	responseContract: createRoutineFolderResponse,
	execute: async (
		runtime: ToolRuntime,
		args: CreateRoutineFolderParams,
	): Promise<PostV1RoutineFolders201 | null | undefined> => {
		return runtime.getClient().createRoutineFolder(args);
	},
} satisfies ToolDefinition<
	typeof createRoutineFolderSchema,
	PostV1RoutineFolders201 | null | undefined
>;

export const folderToolDefinitions = [
	getRoutineFolderDefinition,
	createRoutineFolderDefinition,
] as const;
