import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import type { RoutineFolder } from "../generated/client/types/index.js";
import { formatRoutineFolder } from "../utils/formatters.js";
import type { HevyClient } from "../utils/hevyClient.js";
import { registerFolderTools } from "./folders.js";

function createMockServer(
	options: {
		capabilities?: unknown;
		result?: {
			action: "accept" | "decline" | "cancel";
			content?: { confirm: boolean };
		};
	} = {},
) {
	const tool = vi.fn();
	const capabilities = Object.hasOwn(options, "capabilities")
		? options.capabilities
		: { elicitation: { form: {} } };
	const elicitInput = vi
		.fn()
		.mockResolvedValue(
			options.result ?? { action: "accept", content: { confirm: true } },
		);
	const server = {
		tool,
		registerTool: tool,
		server: {
			getClientCapabilities: vi.fn(() => capabilities),
			elicitInput,
		},
	} as unknown as McpServer;
	return { elicitInput, server, tool };
}

function getToolRegistration(toolSpy: ReturnType<typeof vi.fn>, name: string) {
	const match = toolSpy.mock.calls.find(([toolName]) => toolName === name);
	if (!match) {
		throw new Error(`Tool ${name} was not registered`);
	}
	const handler = match.at(-1) as (args: Record<string, unknown>) => Promise<{
		content: Array<{ type: string; text: string }>;
		isError?: boolean;
		structuredContent?: Record<string, unknown>;
	}>;
	const config = match[1] as { outputSchema?: unknown } | undefined;
	return { outputSchema: config?.outputSchema, handler };
}

describe("registerFolderTools", () => {
	it("returns error responses when Hevy client is not initialized", async () => {
		const { server, tool } = createMockServer();
		registerFolderTools(server, null);

		const toolNames = ["get-routine-folders", "get-routine-folder"];

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

	it("get-routine-folders returns error response on client failure", async () => {
		const { server, tool } = createMockServer();
		const hevyClient: HevyClient = {
			getRoutineFolders: vi
				.fn()
				.mockRejectedValue(new Error("Routine folders request failed")),
		} as unknown as HevyClient;

		registerFolderTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-routine-folders");

		const response = await handler({ page: 1, pageSize: 5 });

		expect(hevyClient.getRoutineFolders).toHaveBeenCalledWith({
			page: 1,
			pageSize: 5,
		});
		expect(response).toMatchObject({
			isError: true,
			content: [
				{
					type: "text",
					text: expect.stringContaining("The request failed unexpectedly"),
				},
			],
		});
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
		expect(response.structuredContent).toEqual({ routineFolders: parsed });
	});

	it("get-routine-folders returns a structured empty list", async () => {
		const { server, tool } = createMockServer();
		const hevyClient = {
			getRoutineFolders: vi.fn().mockResolvedValue({ routine_folders: [] }),
		} as unknown as HevyClient;
		registerFolderTools(server, hevyClient);

		const response = await getToolRegistration(
			tool,
			"get-routine-folders",
		).handler({ page: 1, pageSize: 5 });

		expect(response.structuredContent).toEqual({ routineFolders: [] });
		expect(response.content[0]?.text).toBe(
			"No routine folders found for the specified parameters",
		);
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
		expect(response.structuredContent).toEqual({ routineFolder: null });
	});

	it("get-routine-folder returns structured folder details", async () => {
		const { server, tool } = createMockServer();
		const folder: RoutineFolder = { id: 1, title: "Strength" };
		const hevyClient = {
			getRoutineFolder: vi.fn().mockResolvedValue(folder),
		} as unknown as HevyClient;
		registerFolderTools(server, hevyClient);

		const response = await getToolRegistration(
			tool,
			"get-routine-folder",
		).handler({ folderId: "1" });
		const parsed = JSON.parse(response.content[0].text) as unknown;

		expect(response.structuredContent).toEqual({ routineFolder: parsed });
	});

	it("create-routine-folder maps arguments to the request body and formats the response", async () => {
		const { server, tool } = createMockServer({ capabilities: {} });
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

	it.each([
		["declined", { result: { action: "decline" as const } }],
		["canceled", { result: { action: "cancel" as const } }],
		["unsupported", { capabilities: {} }],
	])(
		"does not create a routine folder when confirmation is %s",
		async (_label, confirmation) => {
			const { server, tool } = createMockServer(confirmation);
			const createRoutineFolder = vi.fn();
			const hevyClient = { createRoutineFolder } as unknown as HevyClient;
			registerFolderTools(server, hevyClient, { confirmMutations: true });

			await getToolRegistration(tool, "create-routine-folder").handler({
				name: "Guarded Folder",
			});

			expect(createRoutineFolder).not.toHaveBeenCalled();
		},
	);

	it("returns an error without creating a folder when elicitation fails", async () => {
		const { elicitInput, server, tool } = createMockServer();
		elicitInput.mockRejectedValueOnce(
			new Error("elicitation transport failed"),
		);
		const createRoutineFolder = vi.fn();
		const hevyClient = { createRoutineFolder } as unknown as HevyClient;
		registerFolderTools(server, hevyClient, { confirmMutations: true });

		const response = await getToolRegistration(
			tool,
			"create-routine-folder",
		).handler({ name: "Guarded Folder" });

		expect(response.isError).toBe(true);
		expect(response.content[0]?.text).toContain(
			"The request failed unexpectedly. Please try again.",
		);
		expect(createRoutineFolder).not.toHaveBeenCalled();
	});
});
