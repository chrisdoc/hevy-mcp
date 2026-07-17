/* oxlint-disable typescript/unbound-method */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";
import type { HevyClient } from "../utils/hevyClient.js";
import { registerToolDefinition } from "./define-tool.js";
import { createToolRuntime } from "./tool-runtime.js";
import { userToolDefinitions } from "./user.js";

function registerUserDefinition(server: McpServer, client: HevyClient | null) {
	const catalog: ExerciseTemplateCatalog = {
		get: vi.fn(),
		reset: vi.fn(),
	};
	registerToolDefinition(
		server,
		createToolRuntime({ client, catalog }),
		userToolDefinitions[0],
	);
}

function createMockServer() {
	const tool = vi.fn();
	const server = { tool, registerTool: tool } as unknown as McpServer;
	return { server, tool };
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

describe("userToolDefinitions", () => {
	it("returns error response when Hevy client is not initialized", async () => {
		const { server, tool } = createMockServer();
		registerUserDefinition(server, null);

		const { handler } = getToolRegistration(tool, "get-user-info");
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
	});

	it("get-user-info returns an error response when the client rejects", async () => {
		const { server, tool } = createMockServer();
		const hevyClient: HevyClient = {
			getUserInfo: vi.fn().mockRejectedValue(new Error("User API timeout")),
		} as unknown as HevyClient;

		registerUserDefinition(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-user-info");

		const response = await handler({});

		expect(vi.mocked(hevyClient.getUserInfo)).toHaveBeenCalledTimes(1);
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

	it("get-user-info returns the user info from the client", async () => {
		const { server, tool } = createMockServer();
		const userInfo = {
			id: "user-123",
			name: "Chris",
			url: "https://hevy.com/user/chris",
		};
		const hevyClient: HevyClient = {
			getUserInfo: vi.fn().mockResolvedValue({ data: userInfo }),
		} as unknown as HevyClient;

		registerUserDefinition(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-user-info");

		const response = await handler({});

		expect(vi.mocked(hevyClient.getUserInfo)).toHaveBeenCalled();
		const parsed = JSON.parse(response.content[0].text) as unknown;
		expect(parsed).toEqual(userInfo);
		expect(response.structuredContent).toEqual({ user: userInfo });
	});

	it("get-user-info returns empty response when no user info is found", async () => {
		const { server, tool } = createMockServer();
		const hevyClient: HevyClient = {
			getUserInfo: vi.fn().mockResolvedValue({}),
		} as unknown as HevyClient;

		registerUserDefinition(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-user-info");

		const response = await handler({});
		expect(response.content[0]?.text).toBe(
			"No user info found for the authenticated user",
		);
		expect(response.structuredContent).toEqual({ user: null });
	});
});
