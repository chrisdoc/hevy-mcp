import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
// Import types from generated client
import type {
	GetV1RoutineFolders200,
	GetV1RoutineFoldersFolderid200,
	PostV1RoutineFolders201,
	RoutineFolder,
} from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { formatRoutineFolder } from "../utils/formatters.js";
import type { HevyClient } from "../utils/hevyClient.js";
import {
	routineFolderOutputSchema,
	routineFoldersOutputSchema,
} from "../utils/output-schemas.js";
import {
	createEmptyResponse,
	createJsonResponse,
	createStructuredEmptyResponse,
	createStructuredJsonResponse,
} from "../utils/response-formatter.js";
import {
	createAnnotations,
	readOnlyAnnotations,
} from "../utils/tool-annotations.js";
import { requireClient, type InferToolParams } from "../utils/tool-helpers.js";

/**
 * Register all routine folder-related tools with the MCP server
 */
export function registerFolderTools(
	server: McpServer,
	hevyClient: HevyClient | null,
) {
	// Get routine folders
	const getRoutineFoldersSchema = {
		page: z.coerce.number().int().gte(1).default(1),
		pageSize: z.coerce.number().int().gte(1).lte(10).default(5),
	} as const;
	type GetRoutineFoldersParams = InferToolParams<
		typeof getRoutineFoldersSchema
	>;

	server.registerTool(
		"get-routine-folders",
		{
			description:
				"Get a paginated list of your routine folders, including both default and custom folders. Useful for organizing and browsing your workout routines.",
			inputSchema: getRoutineFoldersSchema,
			outputSchema: routineFoldersOutputSchema,
			annotations: readOnlyAnnotations("Get Routine Folders"),
		},
		withErrorHandling(async (args: GetRoutineFoldersParams) => {
			const client = requireClient(hevyClient);
			const { page, pageSize } = args;
			const data: GetV1RoutineFolders200 = await client.getRoutineFolders({
				page,
				pageSize,
			});

			// Process routine folders to extract relevant information
			const folders =
				data?.routine_folders?.map((folder: RoutineFolder) =>
					formatRoutineFolder(folder),
				) || [];

			if (folders.length === 0) {
				return createStructuredEmptyResponse(
					"No routine folders found for the specified parameters",
					{ routineFolders: [] },
				);
			}

			return createStructuredJsonResponse(folders, {
				routineFolders: folders,
			});
		}, "get-routine-folders"),
	);

	// Get single routine folder by ID
	const getRoutineFolderSchema = {
		folderId: z.string().min(1),
	} as const;
	type GetRoutineFolderParams = InferToolParams<typeof getRoutineFolderSchema>;

	server.registerTool(
		"get-routine-folder",
		{
			description:
				"Get complete details of a specific routine folder by its ID, including name, creation date, and associated routines.",
			inputSchema: getRoutineFolderSchema,
			outputSchema: routineFolderOutputSchema,
			annotations: readOnlyAnnotations("Get Routine Folder"),
		},
		withErrorHandling(async (args: GetRoutineFolderParams) => {
			const client = requireClient(hevyClient);
			const { folderId } = args;
			const data: GetV1RoutineFoldersFolderid200 =
				await client.getRoutineFolder(folderId);

			if (!data) {
				return createStructuredEmptyResponse(
					`Routine folder with ID ${folderId} not found`,
					{ routineFolder: null },
				);
			}

			const folder = formatRoutineFolder(data);
			return createStructuredJsonResponse(folder, { routineFolder: folder });
		}, "get-routine-folder"),
	);

	// Create new routine folder
	const createRoutineFolderSchema = {
		name: z.string().min(1),
	} as const;
	type CreateRoutineFolderParams = InferToolParams<
		typeof createRoutineFolderSchema
	>;

	server.tool(
		"create-routine-folder",
		"Create a new routine folder in your Hevy account. Requires a name for the folder. Returns the full folder details including the new folder ID.",
		createRoutineFolderSchema,
		createAnnotations("Create Routine Folder"),
		withErrorHandling(async (args: CreateRoutineFolderParams) => {
			const client = requireClient(hevyClient);
			const { name } = args;
			const data: PostV1RoutineFolders201 = await client.createRoutineFolder({
				routine_folder: {
					title: name,
				},
			});

			if (!data) {
				return createEmptyResponse(
					"Failed to create routine folder: Server returned no data",
				);
			}

			const folder = formatRoutineFolder(data);
			return createJsonResponse(folder, {
				pretty: true,
				indent: 2,
			});
		}, "create-routine-folder"),
	);
}
