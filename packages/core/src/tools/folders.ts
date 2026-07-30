// Import types from generated client
import type {
	GetV1RoutineFolders200,
	GetV1RoutineFoldersFolderid200,
	PostV1RoutineFolders201,
	RoutineFolder,
} from "@hevy-mcp/hevy-client/types";
import type { ToolDefinition } from "./define-tool.js";
import type { PaginatedToolResult } from "../utils/response-contracts.js";
import type { ToolRuntime } from "./tool-runtime.js";
import {
	createRoutineFolderResponse,
	routineFolderResponse,
	routineFoldersResponse,
} from "../utils/response-contracts.js";
import {
	createAnnotations,
	readOnlyAnnotations,
} from "../utils/tool-annotations.js";

import type { InferToolParams } from "../utils/tool-helpers.js";
import {
	nonEmptyId,
	paginationShape,
	routineFolderInputShape,
} from "./input-schemas.js";
import {
	isExpectedListPageNotFound,
	isExpectedReadNotFound,
} from "../utils/hevy-error-policy.js";

const getRoutineFoldersSchema = paginationShape({
	defaultPageSize: 5,
	maxPageSize: 10,
});
type GetRoutineFoldersParams = InferToolParams<typeof getRoutineFoldersSchema>;

const getRoutineFolderSchema = { folder_id: nonEmptyId } as const;
type GetRoutineFolderParams = InferToolParams<typeof getRoutineFolderSchema>;

const createRoutineFolderSchema = routineFolderInputShape;
type CreateRoutineFolderParams = InferToolParams<
	typeof createRoutineFolderSchema
>;

const getRoutineFoldersDefinition = {
	name: "get-routine-folders",
	feature: "folders" as const,
	operation: "list" as const,
	description:
		"Read-only. Lists routine folders and IDs; results are paginated.",
	inputSchema: getRoutineFoldersSchema,
	outputSchema: routineFoldersResponse.outputSchema,
	annotations: readOnlyAnnotations("Get Routine Folders"),
	kind: "read" as const,
	responseContract: routineFoldersResponse,
	execute: async (
		runtime: ToolRuntime,
		args: GetRoutineFoldersParams,
	): Promise<PaginatedToolResult<RoutineFolder>> => {
		const { page, page_size } = args;
		try {
			const data: GetV1RoutineFolders200 = await runtime
				.getClient()
				.getRoutineFolders({ page, pageSize: page_size });
			return {
				items: data?.routine_folders ?? [],
				page,
				pageCount: data?.page_count,
			};
		} catch (error) {
			if (isExpectedListPageNotFound(error, page)) {
				return { items: [], page, expected404Outcome: "end_of_list" };
			}
			throw error;
		}
	},
} satisfies ToolDefinition<
	typeof getRoutineFoldersSchema,
	PaginatedToolResult<RoutineFolder>
>;

const getRoutineFolderDefinition = {
	name: "get-routine-folder",
	feature: "folders" as const,
	operation: "get" as const,
	description:
		"Read-only. Gets one routine folder by folder_id. Use get-routine-folders to discover IDs.",
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
	getRoutineFoldersDefinition,
	getRoutineFolderDefinition,
	createRoutineFolderDefinition,
] as const;
