import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HevyClient } from "../generated/client/hevyClient.js";
import { formatRoutineFolder } from "../utils/formatters.js";

/**
 * Register all routine folder-related tools with the MCP server
 */
export function registerFolderTools(server: McpServer, hevyClient: HevyClient) {
	// Get routine folders
	server.tool(
		"get-routine-folders",
		"Get a paginated list of routine folders available on the account. Returns folder details including ID, title, index (order position), and creation/update timestamps. Useful for organizing routines into categories.",
		{
			page: z.coerce.number().int().gte(1).default(1),
			pageSize: z.coerce.number().int().gte(1).lte(10).default(5),
		},
		async ({ page, pageSize }) => {
			try {
				const data = await hevyClient.routine_folders.get({
					queryParameters: {
						page,
						pageSize,
					},
				});

				// Process routine folders to extract relevant information
				const folders =
					data?.routineFolders?.map((folder) => formatRoutineFolder(folder)) ||
					[];

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(folders, null, 2),
						},
					],
				};
			} catch (error) {
				console.error("Error fetching routine folders:", error);
				return {
					content: [
						{
							type: "text",
							text: `Error fetching routine folders: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				};
			}
		},
	);

	// Get single routine folder by ID
	server.tool(
		"get-routine-folder",
		"Get complete details of a specific routine folder by ID. Returns all folder information including title, index (order position), and creation/update timestamps.",
		{
			folderId: z.coerce.number().int(),
		},
		async ({ folderId }) => {
			try {
				const data = await hevyClient.routine_folders
					.byFolderId(folderId.toString())
					.get();

				if (!data) {
					return {
						content: [
							{
								type: "text",
								text: `Routine folder with ID ${folderId} not found`,
							},
						],
					};
				}

				const folder = formatRoutineFolder(data);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(folder, null, 2),
						},
					],
				};
			} catch (error) {
				console.error(`Error fetching routine folder ${folderId}:`, error);
				return {
					content: [
						{
							type: "text",
							text: `Error fetching routine folder: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				};
			}
		},
	);

	// Create new routine folder
	server.tool(
		"create-routine-folder",
		"Create a new routine folder in your Hevy account. The folder will be created at index 0, and all other folders will have their indexes incremented. Returns the complete folder details upon successful creation including the newly assigned folder ID.",
		{
			title: z.string().min(1),
		},
		async ({ title }) => {
			try {
				const data = await hevyClient.routine_folders.post({
					routineFolder: {
						title,
					},
				});

				if (!data) {
					return {
						content: [
							{
								type: "text",
								text: "Failed to create routine folder",
							},
						],
					};
				}

				const folder = formatRoutineFolder(data);

				return {
					content: [
						{
							type: "text",
							text: `Routine folder created successfully:\n${JSON.stringify(folder, null, 2)}`,
						},
					],
				};
			} catch (error) {
				console.error("Error creating routine folder:", error);
				return {
					content: [
						{
							type: "text",
							text: `Error creating routine folder: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				};
			}
		},
	);
}
