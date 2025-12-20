import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { registerWebhookTools } from "./webhooks.js";

type HevyClient = ReturnType<
	typeof import("../utils/hevyClientKubb.js").createClient
> & {
	createWebhookSubscription?: (data: {
		webhook: {
			url: string;
			authToken: string | null;
		};
	}) => Promise<unknown>;
	getWebhookSubscription?: () => Promise<unknown>;
	deleteWebhookSubscription?: () => Promise<unknown>;
};

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
	const [, , schema, handler] = match as [
		string,
		string,
		Record<string, unknown>,
		(args: Record<string, unknown>) => Promise<{
			content: Array<{ type: string; text: string }>;
			isError?: boolean;
		}>,
	];
	return { schema, handler };
}

describe("registerWebhookTools", () => {
	it("validates webhook URLs using the refined schema", () => {
		const { server, tool } = createMockServer();
		registerWebhookTools(server, null);

		const { schema } = getToolRegistration(tool, "create-webhook-subscription");
		const zodSchema = z.object(schema as Record<string, z.ZodTypeAny>);

		// Accepts valid HTTPS URL
		const valid = zodSchema.safeParse({
			url: "https://example.com/webhook",
			authToken: "secret",
		});
		expect(valid.success).toBe(true);

		// Rejects non-http/https protocol
		const invalidProtocol = zodSchema.safeParse({
			url: "ftp://example.com/webhook",
		});
		expect(invalidProtocol.success).toBe(false);
		if (!invalidProtocol.success) {
			expect(invalidProtocol.error.issues[0]?.message).toBe(
				"Webhook URL must be a valid HTTP or HTTPS URL",
			);
		}

		// Rejects localhost / loopback hosts
		const invalidHost = zodSchema.safeParse({
			url: "http://localhost:3000/webhook",
		});
		expect(invalidHost.success).toBe(false);
		if (!invalidHost.success) {
			expect(invalidHost.error.issues[0]?.message).toBe(
				"Webhook URL cannot be localhost or loopback address",
			);
		}
	});

	it("returns error responses when Hevy client is not initialized", async () => {
		const { server, tool } = createMockServer();
		registerWebhookTools(server, null);

		const toolNames = [
			"get-webhook-subscription",
			"create-webhook-subscription",
			"delete-webhook-subscription",
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

	it("create-webhook-subscription uses the client when available", async () => {
		const { server, tool } = createMockServer();
		const hevyClient: HevyClient = {
			createWebhookSubscription: vi.fn().mockResolvedValue({ id: "sub-1" }),
		} as unknown as HevyClient;

		registerWebhookTools(server, hevyClient);
		const { handler } = getToolRegistration(
			tool,
			"create-webhook-subscription",
		);

		const response = await handler({
			url: "https://example.com/webhook",
			authToken: "secret",
		} as Record<string, unknown>);

		expect(hevyClient.createWebhookSubscription).toHaveBeenCalledWith({
			webhook: {
				url: "https://example.com/webhook",
				authToken: "secret",
			},
		});

		const parsed = JSON.parse(response.content[0].text) as unknown;
		expect(parsed).toEqual({ id: "sub-1" });
	});

	it("create-webhook-subscription surfaces API availability errors", async () => {
		const { server, tool } = createMockServer();
		// Client without the webhook API methods
		const hevyClient = {} as HevyClient;

		registerWebhookTools(server, hevyClient);
		const { handler } = getToolRegistration(
			tool,
			"create-webhook-subscription",
		);

		const response = await handler({
			url: "https://example.com/webhook",
		} as Record<string, unknown>);

		expect(response).toMatchObject({
			isError: true,
			content: [
				{
					type: "text",
					text: expect.stringContaining(
						"Webhook subscription API not available. Please regenerate the client",
					),
				},
			],
		});
	});

	it("get-webhook-subscription returns JSON when a subscription exists", async () => {
		const { server, tool } = createMockServer();
		const hevyClient: HevyClient = {
			getWebhookSubscription: vi.fn().mockResolvedValue({
				url: "https://example.com/webhook",
				authToken: "x",
			}),
		} as unknown as HevyClient;

		registerWebhookTools(server, hevyClient);
		const { handler } = getToolRegistration(tool, "get-webhook-subscription");

		const response = await handler({});
		expect(hevyClient.getWebhookSubscription).toHaveBeenCalledTimes(1);

		const parsed = JSON.parse(response.content[0].text) as unknown;
		expect(parsed).toEqual({
			url: "https://example.com/webhook",
			authToken: "x",
		});
	});

	it("delete-webhook-subscription calls the client and returns JSON", async () => {
		const { server, tool } = createMockServer();
		const hevyClient: HevyClient = {
			deleteWebhookSubscription: vi.fn().mockResolvedValue({ success: true }),
		} as unknown as HevyClient;

		registerWebhookTools(server, hevyClient);
		const { handler } = getToolRegistration(
			tool,
			"delete-webhook-subscription",
		);

		const response = await handler({});
		expect(hevyClient.deleteWebhookSubscription).toHaveBeenCalledTimes(1);

		const parsed = JSON.parse(response.content[0].text) as unknown;
		expect(parsed).toEqual({ success: true });
	});
});
