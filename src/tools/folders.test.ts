import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import type { RoutineFolder } from "../generated/client/types/index.js";
import { formatRoutineFolder } from "../utils/formatters.js";
import { registerFolderTools } from "./folders.js";

type HevyClient = ReturnType<
	typeof import("../utils/hevyClientKubb.js").createClient
>;

function createMockServer() {
	const tool = vi.fn();
	const server = { tool } as unknown as McpServer;
	return { server, tool };
}

function getToolRegistration(toolSpy: ReturnType<typeof vi.fn>, name: string) {
	const match = toolSpy.mock.calls.find(([toolName]) => toolName === name);
	if (!match) {
		throw new Error(`Tool ${name} was not registered`);
	}
	const [, , , handler] = match as [
		string,
		string,
		Record<string, unknown>,
		(args: Record<string, unknown>) => Promise<{
			content: Array<{ type: string; text: string }>;
			isError?: boolean;
		}>,
	];
	return { handler };
}

describe("registerFolderTools", () => {
	it("returns error responses when Hevy client is not initialized", async () => {
		const { server, tool } = createMockServer();
		registerFolderTools(server, null);

		const toolNames = [
			"get-routine-folders",
			"get-routine-folder",
			"create-routine-folder",
		];

		for (const name of toolNames) {
			const { handler } = getToolRegistration(tool, name);
			const response = await handler({});
			expect(response).toMatchObject({
				isError: true,
				content: [
					{
						type: "text",
						text: expect.stringContaining(
							"API client not initialized. Please provide HEVY_API_KEY.",
						),
					},
				],
			});
		}
	});

	it("get-routine-folders returns formatted folders from the client", async () => {
		const { server, tool } = createMockServer();
		const folder: RoutineFolder = {
			id: 1,
			title: "Strength",
			created_at: "2025-03-25T10:00:00Z",
			updated_at: "2025-03-25T10:10:00Z",
		};
		const hevyClient: HevyClient = {
			getRoutineFolders: vi
				.fn()
				.mockResolvedValue({ routine_folders: [folder] }),
		} as unknown as HevyClient;

		registerFolderTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-routine-folders");

		const response = await handler({ page: 1, pageSize: 5 });

		expect(hevyClient.getRoutineFolders).toHaveBeenCalledWith({
			page: 1,
			pageSize: 5,
		});

		const parsed = JSON.parse(response.content[0].text) as unknown[];
		expect(parsed).toEqual([formatRoutineFolder(folder)]);
	});

	it("get-routine-folder returns an empty response when folder is not found", async () => {
		const { server, tool } = createMockServer();
		const hevyClient: HevyClient = {
			getRoutineFolder: vi.fn().mockResolvedValue(null),
		} as unknown as HevyClient;

		registerFolderTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-routine-folder");

		const response = await handler({ folderId: "missing-id" });
		expect(hevyClient.getRoutineFolder).toHaveBeenCalledWith("missing-id");
		expect(response.content[0]?.text).toBe(
			"Routine folder with ID missing-id not found",
		);
	});

	it("create-routine-folder maps arguments to the request body and formats the response", async () => {
		const { server, tool } = createMockServer();
		const folder: RoutineFolder = {
			id: 2,
			title: "Hypertrophy",
			created_at: "2025-03-25T11:00:00Z",
			updated_at: "2025-03-25T11:00:00Z",
		};
		const hevyClient: HevyClient = {
			createRoutineFolder: vi.fn().mockResolvedValue(folder),
		} as unknown as HevyClient;

		registerFolderTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "create-routine-folder");

		const response = await handler({ name: "Hypertrophy" } as Record<
			string,
			unknown
		>);

		expect(hevyClient.createRoutineFolder).toHaveBeenCalledWith({
			routine_folder: {
				title: "Hypertrophy",
			},
		});

		const parsed = JSON.parse(response.content[0].text) as unknown;
		expect(parsed).toEqual(formatRoutineFolder(folder));
	});
});
