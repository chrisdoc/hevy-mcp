import { z } from "zod";
// Import types from generated client
import type {
	GetV1RoutineFolders200,
	GetV1RoutineFoldersFolderid200,
	PostV1RoutineFolders201,
	RoutineFolder,
} from "../generated/client/types/index.js";
import type { ToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";
import {
	createRoutineFolderResponse,
	routineFolderResponse,
	routineFoldersResponse,
} from "../utils/response-formatter.js";
import {
	createAnnotations,
	readOnlyAnnotations,
} from "../utils/tool-annotations.js";
import { describeTool } from "../utils/tool-descriptions.js";
import type { InferToolParams } from "../utils/tool-helpers.js";
import { nonEmptyId, paginationShape } from "./input-schemas.js";

const getRoutineFoldersSchema = paginationShape({
	defaultPageSize: 5,
	maxPageSize: 10,
});
type GetRoutineFoldersParams = InferToolParams<typeof getRoutineFoldersSchema>;

const getRoutineFolderSchema = { folderId: nonEmptyId } as const;
type GetRoutineFolderParams = InferToolParams<typeof getRoutineFolderSchema>;

const createRoutineFolderSchema = {
	name: z.string().min(1),
} as const;
type CreateRoutineFolderParams = InferToolParams<
	typeof createRoutineFolderSchema
>;

const getRoutineFoldersDefinition = {
	name: "get-routine-folders",
	feature: "folders" as const,
	operation: "list" as const,
	description: describeTool({
		summary: "Read-only. Lists default and custom routine folders.",
		aliases: ["list folders", "browse routine groups", "show plan folders"],
		useCase:
			"Use to browse folder organization or discover folder IDs for routine creation.",
		importantNotes:
			"Results are paginated; page starts at 1 and pageSize is limited to 10.",
	}),
	inputSchema: getRoutineFoldersSchema,
	outputSchema: routineFoldersResponse.outputSchema,
	annotations: readOnlyAnnotations("Get Routine Folders"),
	kind: "read" as const,
	responseContract: routineFoldersResponse,
	execute: async (
		runtime: ToolRuntime,
		args: GetRoutineFoldersParams,
	): Promise<RoutineFolder[] | undefined> => {
		const { page, pageSize } = args;
		const data: GetV1RoutineFolders200 = await runtime
			.getClient()
			.getRoutineFolders({
				page,
				pageSize,
			});

		return data?.routine_folders;
	},
} satisfies ToolDefinition<
	typeof getRoutineFoldersSchema,
	RoutineFolder[] | undefined
>;

const getRoutineFolderDefinition = {
	name: "get-routine-folder",
	feature: "folders" as const,
	operation: "get" as const,
	description: describeTool({
		summary: "Read-only. Retrieves one routine folder's metadata by ID.",
		aliases: ["show folder", "folder details", "routine folder metadata"],
		useCase:
			"Use for one known folder; use get-routine-folders to browse or discover folder IDs.",
		importantNotes:
			"Requires a folderId from get-routine-folders or a prior create response.",
	}),
	inputSchema: getRoutineFolderSchema,
	outputSchema: routineFolderResponse.outputSchema,
	annotations: readOnlyAnnotations("Get Routine Folder"),
	kind: "read" as const,
	responseContract: routineFolderResponse,
	execute: async (
		runtime: ToolRuntime,
		args: GetRoutineFolderParams,
	): Promise<{
		routineFolder: GetV1RoutineFoldersFolderid200 | null | undefined;
		folderId: string;
	}> => {
		const { folderId } = args;
		const data: GetV1RoutineFoldersFolderid200 | null = await runtime
			.getClient()
			.getRoutineFolder(folderId);

		return {
			routineFolder: data,
			folderId,
		};
	},
} satisfies ToolDefinition<
	typeof getRoutineFolderSchema,
	{
		routineFolder: GetV1RoutineFoldersFolderid200 | null | undefined;
		folderId: string;
	}
>;

const createRoutineFolderDefinition = {
	name: "create-routine-folder",
	feature: "folders" as const,
	operation: "create" as const,
	description: describeTool({
		summary: "Writes to the Hevy account by creating a new routine folder.",
		aliases: ["add folder", "organize routines", "create plan group"],
		useCase:
			"Use to create an organizational destination before assigning new routines to a folderId.",
		importantNotes:
			"Requires a non-empty name. Retrying or reusing a name can create duplicate folders.",
	}),
	inputSchema: createRoutineFolderSchema,
	annotations: createAnnotations("Create Routine Folder"),
	kind: "write" as const,
	responseContract: createRoutineFolderResponse,
	execute: async (
		runtime: ToolRuntime,
		args: CreateRoutineFolderParams,
	): Promise<PostV1RoutineFolders201 | null | undefined> => {
		const { name } = args;
		return runtime.getClient().createRoutineFolder({
			routine_folder: {
				title: name,
			},
		});
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
