/* oxlint-disable typescript/unbound-method */
import type { McpServer } from "@modelcontextprotocol/server";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import { describe, expect, it, vi } from "vitest";
import { createToolRuntime } from "./tool-runtime.js";
import { folderToolDefinitions } from "./folders.js";
import { registerToolDefinition } from "./define-tool.js";

function register(client: HevyClient | null) {
	const tool = vi.fn();
	const server = { tool, registerTool: tool } as unknown as McpServer;
	const runtime = createToolRuntime({ client, catalog: {} as never });
	for (const definition of folderToolDefinitions)
		registerToolDefinition(server, runtime, definition);
	return tool;
}

function handler(tool: { mock: { calls: unknown[][] } }, name: string) {
	const call = tool.mock.calls.find(
		([registeredName]) => registeredName === name,
	);
	if (!call) throw new Error(`Tool ${name} was not registered`);
	return call.at(-1) as (
		args: Record<string, unknown>,
	) => Promise<Record<string, unknown>>;
}

describe("routine folder tools", () => {
	it("maps snake_case pagination and folder identifiers", async () => {
		const client = {
			getRoutineFolders: vi
				.fn()
				.mockResolvedValue({ routine_folders: [], page_count: 1 }),
			getRoutineFolder: vi.fn().mockResolvedValue({ id: 3, title: "Strength" }),
		} as unknown as HevyClient;
		const tool = register(client);

		await handler(tool, "get-routine-folders")({ page: 2, page_size: 5 });
		await handler(tool, "get-routine-folder")({ folder_id: "3" });
		expect(client.getRoutineFolders).toHaveBeenCalledWith({
			page: 2,
			pageSize: 5,
		});
		expect(client.getRoutineFolder).toHaveBeenCalledWith("3");
	});

	it("wraps folder creation in the generated request envelope", async () => {
		const client = {
			createRoutineFolder: vi
				.fn()
				.mockResolvedValue({ id: 4, title: "Strength" }),
		} as unknown as HevyClient;
		const tool = register(client);
		await handler(
			tool,
			"create-routine-folder",
		)({ routine_folder: { title: "Strength" } });
		expect(client.createRoutineFolder).toHaveBeenCalledWith({
			routine_folder: { title: "Strength" },
		});
	});

	it("rejects legacy folderId and pageSize arguments", () => {
		const tool = register(null);
		const listSchema = tool.mock.calls.find(
			([name]) => name === "get-routine-folders",
		)?.[1] as { inputSchema: { parse(value: unknown): unknown } };
		expect(() =>
			listSchema.inputSchema.parse({ page: 1, pageSize: 5 }),
		).toThrow();
	});
});
