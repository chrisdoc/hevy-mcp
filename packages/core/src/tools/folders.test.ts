/* oxlint-disable typescript/unbound-method */
import type { McpServer } from "@modelcontextprotocol/server";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import { describe, expect, it, vi } from "vitest";
import { createToolRuntime } from "./tool-runtime.js";
import { folderToolDefinitions } from "./folders.js";
import { registerToolDefinition } from "./define-tool.js";

function mockOf<T>(value: unknown): T {
	return value as T;
}

function register(client: HevyClient | null) {
	const tool = vi.fn();
	const server = mockOf<McpServer>({ tool, registerTool: tool });
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
	return call.at(-1) as (args: object) => Promise<object>;
}

describe("routine folder tools", () => {
	it("maps snake_case pagination and folder identifiers", async () => {
		const client = mockOf<HevyClient>({
			getRoutineFolder: vi.fn().mockResolvedValue({ id: 3, title: "Strength" }),
		});
		const tool = register(client);

		await handler(tool, "get-routine-folder")({ folder_id: "3" });
		expect(client.getRoutineFolder).toHaveBeenCalledWith("3");
	});

	it("wraps folder creation in the generated request envelope", async () => {
		const client = mockOf<HevyClient>({
			createRoutineFolder: vi
				.fn()
				.mockResolvedValue({ id: 4, title: "Strength" }),
		});
		const tool = register(client);
		await handler(
			tool,
			"create-routine-folder",
		)({ routine_folder: { title: "Strength" } });
		expect(client.createRoutineFolder).toHaveBeenCalledWith({
			routine_folder: { title: "Strength" },
		});
	});
});
