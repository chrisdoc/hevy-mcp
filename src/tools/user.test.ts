import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import type { HevyClient } from "../utils/hevyClient.js";
import { registerUserTools } from "./user.js";

type Handler = (args: Record<string, unknown>) => Promise<{
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
}>;

function getHandler(client: Partial<HevyClient> | null): Handler {
	const tool = vi.fn();
	registerUserTools(
		{ tool } as unknown as McpServer,
		client as HevyClient | null,
	);
	return tool.mock.calls[0]?.[3] as Handler;
}

describe("registerUserTools", () => {
	it("get-user-info returns formatted user info including units", async () => {
		const handler = getHandler({
			getUserInfo: vi.fn().mockResolvedValue({
				data: {
					id: "user-1",
					username: "lifter",
					name: "Lifter",
					url: "https://hevy.com/user/lifter",
					weight_unit: "lbs",
					distance_unit: "miles",
					is_pro: true,
				},
			}),
		});

		const response = await handler({});

		expect(JSON.parse(response.content[0]?.text ?? "{}")).toEqual({
			id: "user-1",
			username: "lifter",
			name: "Lifter",
			url: "https://hevy.com/user/lifter",
			weightUnit: "lbs",
			distanceUnit: "miles",
			isPro: true,
		});
	});

	it("get-user-info handles an empty response", async () => {
		const handler = getHandler({
			getUserInfo: vi.fn().mockResolvedValue({}),
		});

		const response = await handler({});

		expect(response.content[0]?.text).toBe("User info not found");
	});

	it("get-user-info errors when the client is not initialized", async () => {
		const response = await getHandler(null)({});
		expect(response.isError).toBe(true);
	});
});
