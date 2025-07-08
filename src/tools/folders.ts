import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
// Import types from generated client
import type { RoutineFolder } from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { formatRoutineFolder } from "../utils/formatters.js";
import {
	createEmptyResponse,
	createJsonResponse,
} from "../utils/response-formatter.js";

// Type definitions for the folder operations
type HevyClient = ReturnType<
	typeof import("../utils/hevyClientKubb.js").createClient
>;

/**
 * Register all routine folder-related tools with the MCP server
 */
export function registerFolderTools(server: McpServer, hevyClient: HevyClient) {
	// Get routine folders
	server.tool(
		"get-routine-folders",
		"Get a paginated list of your routine folders, including both default and custom folders. Useful for organizing and browsing your workout routines.",
		{
			page: z.coerce.number().int().gte(1).default(1),
			pageSize: z.coerce.number().int().gte(1).lte(10).default(5),
		},
		withErrorHandling(
			async ({ page, pageSize }: { page: number; pageSize: number }) => {
				const data = await hevyClient.getRoutineFolders({
					page,
					pageSize,
				});

				// Process routine folders to extract relevant information
				const folders =
					data?.routine_folders?.map((folder: RoutineFolder) =>
						formatRoutineFolder(folder),
					) || [];

				if (folders.length === 0) {
					return createEmptyResponse(
						"No routine folders found for the specified parameters",
					);
				}

				return createJsonResponse(folders);
			},
			"get-routine-folders",
		),
	);

	// Get single routine folder by ID
	server.tool(
		"get-routine-folder",
		"Get complete details of a specific routine folder by its ID, including name, creation date, and associated routines.",
		{
			folderId: z.string().min(1),
		},
		withErrorHandling(async ({ folderId }: { folderId: string }) => {
			const data = await hevyClient.getRoutineFolder(folderId);

			if (!data) {
				return createEmptyResponse(
					`Routine folder with ID ${folderId} not found`,
				);
			}

			const folder = formatRoutineFolder(data);
			return createJsonResponse(folder);
		}, "get-routine-folder"),
	);

	// Create new routine folder
	server.tool(
		"create-routine-folder",
		"Create a new routine folder in your Hevy account. Requires a name for the folder. Returns the full folder details including the new folder ID.",
		{
			name: z.string().min(1),
		},
		withErrorHandling(async ({ name }: { name: string }) => {
			const data = await hevyClient.createRoutineFolder({
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
