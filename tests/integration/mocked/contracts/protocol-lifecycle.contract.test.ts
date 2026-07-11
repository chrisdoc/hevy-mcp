import {
	PromptListChangedNotificationSchema,
	ResourceListChangedNotificationSchema,
	ToolListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import nock from "nock";
import { z } from "zod";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	HEVY_MCP_SERVER_INFO,
	HEVY_MCP_SERVER_OPTIONS,
	registerHevyMcp,
} from "../../../../src/mcp-registration.js";
import { registerWorkoutPrompts } from "../../../../src/prompts/workouts.js";
import {
	cleanupMockedMcpTestState,
	createMockedApiScope,
	createMockedMcpHarness,
	disableMockedMcpExternalNetworking,
} from "../../../support/mocked-mcp.js";

describe("MCP protocol and lifecycle contracts", () => {
	let restoreExternalNetworking: (() => void) | undefined;

	beforeAll(() => {
		restoreExternalNetworking = disableMockedMcpExternalNetworking(() =>
			nock.enableNetConnect(),
		);
	});

	afterEach(async () => {
		await cleanupMockedMcpTestState();
	});

	afterAll(() => {
		restoreExternalNetworking?.();
	});

	it("supports logging-level negotiation and stable repeated list calls", async () => {
		const harness = await createMockedMcpHarness({
			name: "capability-behavior-contract",
			serverInfo: HEVY_MCP_SERVER_INFO,
			serverOptions: HEVY_MCP_SERVER_OPTIONS,
			register: registerHevyMcp,
		});

		try {
			await expect(harness.client.setLoggingLevel("debug")).resolves.toEqual(
				{},
			);
			const [firstTools, secondTools, firstPrompts, secondPrompts] =
				await Promise.all([
					harness.client.listTools(),
					harness.client.listTools(),
					harness.client.listPrompts(),
					harness.client.listPrompts(),
				]);

			expect(secondTools).toEqual(firstTools);
			expect(secondPrompts).toEqual(firstPrompts);
		} finally {
			await harness.close();
		}
	});

	it("emits exactly one notification for each temporary list change", async () => {
		const harness = await createMockedMcpHarness({
			name: "list-change-notification-contract",
			serverOptions: {
				capabilities: {
					prompts: { listChanged: true },
					resources: { listChanged: true },
					tools: { listChanged: true },
				},
			},
			register: (server) => {
				server.registerTool("notification-seed-tool", {}, () => ({
					content: [{ type: "text", text: "seed" }],
				}));
				server.registerPrompt("notification-seed-prompt", {}, () => ({
					messages: [{ role: "user", content: { type: "text", text: "seed" } }],
				}));
				server.registerResource(
					"notification-seed-resource",
					"contract://seed",
					{ mimeType: "text/plain" },
					(uri) => ({
						contents: [
							{
								uri: uri.toString(),
								mimeType: "text/plain",
								text: "seed",
							},
						],
					}),
				);
			},
		});
		const notifications: string[] = [];
		harness.client.setNotificationHandler(
			ToolListChangedNotificationSchema,
			(notification) => {
				notifications.push(notification.method);
			},
		);
		harness.client.setNotificationHandler(
			PromptListChangedNotificationSchema,
			(notification) => {
				notifications.push(notification.method);
			},
		);
		harness.client.setNotificationHandler(
			ResourceListChangedNotificationSchema,
			(notification) => {
				notifications.push(notification.method);
			},
		);

		try {
			harness.server.registerTool(
				"temporary-contract-tool",
				{ inputSchema: { value: z.string() } },
				({ value }) => ({ content: [{ type: "text", text: value }] }),
			);
			harness.server.registerPrompt(
				"temporary-contract-prompt",
				{ argsSchema: { value: z.string() } },
				({ value }) => ({
					messages: [{ role: "user", content: { type: "text", text: value } }],
				}),
			);
			harness.server.registerResource(
				"temporary-contract-resource",
				"contract://temporary",
				{ mimeType: "text/plain" },
				(uri) => ({
					contents: [
						{ uri: uri.toString(), mimeType: "text/plain", text: "ok" },
					],
				}),
			);

			await vi.waitFor(() => {
				expect(notifications).toEqual([
					"notifications/tools/list_changed",
					"notifications/prompts/list_changed",
					"notifications/resources/list_changed",
				]);
			});
		} finally {
			await harness.close();
		}
	});

	it("does not emit list-change notifications for ordinary static operations", async () => {
		const harness = await createMockedMcpHarness({
			name: "static-operation-notification-contract",
			serverInfo: HEVY_MCP_SERVER_INFO,
			serverOptions: HEVY_MCP_SERVER_OPTIONS,
			register: registerHevyMcp,
		});
		const notifications = vi.fn();
		harness.client.setNotificationHandler(
			ToolListChangedNotificationSchema,
			notifications,
		);
		harness.client.setNotificationHandler(
			PromptListChangedNotificationSchema,
			notifications,
		);
		harness.client.setNotificationHandler(
			ResourceListChangedNotificationSchema,
			notifications,
		);

		try {
			await Promise.all([
				harness.client.listTools(),
				harness.client.listPrompts(),
				harness.client.listResources(),
				harness.client.getPrompt({
					name: "analyze-workout-progress",
					arguments: { weeks: "1" },
				}),
			]);
			await Promise.resolve();
			expect(notifications).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("keeps independent concurrent request state isolated", async () => {
		const harness = await createMockedMcpHarness({
			name: "multi-call-isolation-contract",
			register: registerHevyMcp,
		});
		createMockedApiScope()
			.get("/v1/user/info")
			.reply(200, {
				data: {
					id: "isolated-user",
					name: "Isolated User",
					url: "https://hevy.com/user/isolated-user",
				},
			});
		createMockedApiScope()
			.get("/v1/workouts/count")
			.reply(200, { workout_count: 23 });

		try {
			const [userResult, countResult, promptResult] = await Promise.all([
				harness.client.readResource({ uri: "hevy://user" }),
				harness.client.readResource({ uri: "hevy://workout-count" }),
				harness.client.getPrompt({
					name: "analyze-workout-progress",
					arguments: { weeks: "2" },
				}),
			]);
			const userContent = userResult.contents[0];
			const countContent = countResult.contents[0];
			if (
				!userContent ||
				!("text" in userContent) ||
				!countContent ||
				!("text" in countContent)
			) {
				throw new Error("Expected JSON text resource content");
			}

			expect(JSON.parse(userContent.text)).toMatchObject({
				id: "isolated-user",
			});
			expect(JSON.parse(countContent.text)).toEqual({ count: 23 });
			expect(promptResult.messages[0]?.content).toMatchObject({
				type: "text",
				text: expect.stringMatching(/last 2 weeks/),
			});
		} finally {
			await harness.close();
		}
	});

	it("closes idempotently and rejects operations after close", async () => {
		const harness = await createMockedMcpHarness({
			name: "lifecycle-close-contract",
			register: registerWorkoutPrompts,
		});

		await expect(harness.close()).resolves.toBeUndefined();
		await expect(harness.close()).resolves.toBeUndefined();
		await expect(harness.client.listPrompts()).rejects.toThrow("Not connected");
	});
});
