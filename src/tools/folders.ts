import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
// Import types from generated client
import type {
	GetV1RoutineFolders200,
	GetV1RoutineFoldersFolderid200,
	PostV1RoutineFolders201,
} from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import type { HevyClient } from "../utils/hevyClient.js";
import {
	createRoutineFolderResponse,
	respond,
	routineFolderResponse,
	routineFoldersResponse,
} from "../utils/response-formatter.js";
import {
	createAnnotations,
	readOnlyAnnotations,
} from "../utils/tool-annotations.js";
import { requireClient, type InferToolParams } from "../utils/tool-helpers.js";
import { defineTool } from "./define-tool.js";

/**
 * Register all routine folder-related tools with the MCP server
 */
export function registerFolderTools(
	server: McpServer,
	hevyClient: HevyClient | null,
	wrapHandler: typeof withErrorHandling = withErrorHandling,
) {
	// Get routine folders
	const getRoutineFoldersSchema = {
		page: z.coerce.number().int().gte(1).default(1),
		pageSize: z.coerce.number().int().gte(1).lte(10).default(5),
	} as const;
	type GetRoutineFoldersParams = InferToolParams<
		typeof getRoutineFoldersSchema
	>;

	defineTool(server, {
		name: "get-routine-folders",
		description: {
			summary: "Read-only. Lists default and custom routine folders.",
			aliases: ["list folders", "browse routine groups", "show plan folders"],
			useCase:
				"Use to browse folder organization or discover folder IDs for routine creation.",
			importantNotes:
				"Results are paginated; page starts at 1 and pageSize is limited to 10.",
		},
		inputSchema: getRoutineFoldersSchema,
		outputSchema: routineFoldersResponse.outputSchema,
		annotations: readOnlyAnnotations("Get Routine Folders"),
		wrapHandler,
		handler: async (args: GetRoutineFoldersParams) => {
			const client = requireClient(hevyClient);
			const { page, pageSize } = args;
			const data: GetV1RoutineFolders200 = await client.getRoutineFolders({
				page,
				pageSize,
			});

			return respond(routineFoldersResponse, data?.routine_folders);
		},
	});

	// Get single routine folder by ID
	const getRoutineFolderSchema = {
		folderId: z.string().min(1),
	} as const;
	type GetRoutineFolderParams = InferToolParams<typeof getRoutineFolderSchema>;

	defineTool(server, {
		name: "get-routine-folder",
		description: {
			summary: "Read-only. Retrieves one routine folder's metadata by ID.",
			aliases: ["show folder", "folder details", "routine folder metadata"],
			useCase:
				"Use for one known folder; use get-routine-folders to browse or discover folder IDs.",
			importantNotes:
				"Requires a folderId from get-routine-folders or a prior create response.",
		},
		inputSchema: getRoutineFolderSchema,
		outputSchema: routineFolderResponse.outputSchema,
		annotations: readOnlyAnnotations("Get Routine Folder"),
		wrapHandler,
		handler: async (args: GetRoutineFolderParams) => {
			const client = requireClient(hevyClient);
			const { folderId } = args;
			const data: GetV1RoutineFoldersFolderid200 =
				await client.getRoutineFolder(folderId);

			return respond(routineFolderResponse, {
				routineFolder: data,
				folderId,
			});
		},
	});

	// Create new routine folder
	const createRoutineFolderSchema = {
		name: z.string().min(1),
	} as const;
	type CreateRoutineFolderParams = InferToolParams<
		typeof createRoutineFolderSchema
	>;

	defineTool(server, {
		name: "create-routine-folder",
		description: {
			summary: "Writes to the Hevy account by creating a new routine folder.",
			aliases: ["add folder", "organize routines", "create plan group"],
			useCase:
				"Use to create an organizational destination before assigning new routines to a folderId.",
			importantNotes:
				"Requires a non-empty name. Retrying or reusing a name can create duplicate folders.",
		},
		inputSchema: createRoutineFolderSchema,
		annotations: createAnnotations("Create Routine Folder"),
		wrapHandler,
		handler: async (args: CreateRoutineFolderParams) => {
			const client = requireClient(hevyClient);
			const { name } = args;
			const data: PostV1RoutineFolders201 = await client.createRoutineFolder({
				routine_folder: {
					title: name,
				},
			});

			return respond(createRoutineFolderResponse, data);
		},
	});
}
