import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { registerUserTools } from "./user.js";

type HevyClient = ReturnType<
	typeof import("../utils/hevyClientKubb.js").createClient
>;

function createMockServer() {
	const registerTool = vi.fn();
	const server = { registerTool } as unknown as McpServer;
	return { server, registerTool };
}

function getToolRegistration(toolSpy: ReturnType<typeof vi.fn>, name: string) {
	const match = toolSpy.mock.calls.find(([toolName]) => toolName === name);
	if (!match) {
		throw new Error(`Tool ${name} was not registered`);
	}
	const handler = match[2] as (args: Record<string, unknown>) => Promise<{
		content: Array<{ type: string; text: string }>;
		isError?: boolean;
	}>;
	return { handler };
}

describe("registerUserTools", () => {
	it("returns error response when Hevy client is not initialized", async () => {
		const { server, registerTool } = createMockServer();
		registerUserTools(server, null);

		const { handler } = getToolRegistration(registerTool, "get-user-info");
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
		const { server, registerTool } = createMockServer();
		const hevyClient: HevyClient = {
			getUserInfo: vi.fn().mockRejectedValue(new Error("User API timeout")),
		} as unknown as HevyClient;

		registerUserTools(server, hevyClient);
		const { handler } = getToolRegistration(registerTool, "get-user-info");

		const response = await handler({});

		expect(hevyClient.getUserInfo).toHaveBeenCalledTimes(1);
		expect(response).toMatchObject({
			isError: true,
			content: [
				{
					type: "text",
					text: expect.stringContaining("User API timeout"),
				},
			],
		});
	});

	it("get-user-info returns the user info from the client", async () => {
		const { server, registerTool } = createMockServer();
		const userInfo = {
			id: "user-123",
			name: "Chris",
			url: "https://hevy.com/user/chris",
		};
		const hevyClient: HevyClient = {
			getUserInfo: vi.fn().mockResolvedValue({ data: userInfo }),
		} as unknown as HevyClient;

		registerUserTools(server, hevyClient);
		const { handler } = getToolRegistration(registerTool, "get-user-info");

		const response = await handler({});

		expect(hevyClient.getUserInfo).toHaveBeenCalled();
		const parsed = JSON.parse(response.content[0].text) as unknown;
		expect(parsed).toEqual(userInfo);
	});

	it("get-user-info returns empty response when no user info is found", async () => {
		const { server, registerTool } = createMockServer();
		const hevyClient: HevyClient = {
			getUserInfo: vi.fn().mockResolvedValue({}),
		} as unknown as HevyClient;

		registerUserTools(server, hevyClient);
		const { handler } = getToolRegistration(registerTool, "get-user-info");

		const response = await handler({});
		expect(response.content[0]?.text).toBe(
			"No user info found for the authenticated user",
		);
	});
});
