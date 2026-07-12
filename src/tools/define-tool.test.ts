import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type {
	McpServer as McpServerType,
	RegisteredTool,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { withErrorHandling } from "../utils/error-handler.js";
import {
	createStructuredJsonResponse,
	createTextResponse,
	type McpToolResponse,
} from "../utils/response-formatter.js";
import { readOnlyAnnotations } from "../utils/tool-annotations.js";
import { defineTool } from "./define-tool.js";

const description = {
	summary: "Read-only. Test tool summary.",
	aliases: ["test alias", "alternate test alias"],
	useCase: "Use to verify defineTool behavior.",
	importantNotes: "Only used by unit tests.",
} as const;

describe("defineTool", () => {
	let client: Client | undefined;
	let server: McpServer | undefined;

	afterEach(async () => {
		await Promise.all([client?.close(), server?.close()]);
	});

	it("forwards metadata and passes the configured context to the wrapper", () => {
		const registeredTool = { enabled: true } as RegisteredTool;
		let registeredName: string | undefined;
		let registeredConfig:
			| {
					description?: string;
					inputSchema: {
						safeParse: (input: unknown) => { data?: unknown };
					};
					outputSchema?: unknown;
					annotations?: unknown;
			  }
			| undefined;
		const registerTool = vi.fn(
			(
				name: string,
				config: NonNullable<typeof registeredConfig>,
				_callback: unknown,
			) => {
				registeredName = name;
				registeredConfig = config;
				return registeredTool;
			},
		);
		const mockServer = { registerTool } as unknown as McpServerType;
		const wrapperContexts: string[] = [];
		let wrapperApplications = 0;
		const wrapper: typeof withErrorHandling = <
			TParams extends Record<string, unknown>,
			TResponse extends McpToolResponse,
		>(
			handler: (args: TParams) => Promise<TResponse>,
			context: string,
		) => {
			wrapperApplications += 1;
			wrapperContexts.push(context);
			return async (args: TParams) => handler(args);
		};
		const inputSchema = { page: z.number().default(3) } as const;
		const outputSchema = { value: z.number() } as const;
		const annotations = readOnlyAnnotations("Define Tool Test");

		const result = defineTool(mockServer, {
			name: "metadata-test",
			context: "metadata-test-operation",
			description,
			inputSchema,
			outputSchema,
			annotations,
			wrapHandler: wrapper,
			handler: async ({ page }) =>
				createStructuredJsonResponse({ value: page }, { value: page }),
		});

		expect(result).toBe(registeredTool);
		expect(wrapperApplications).toBe(1);
		expect(wrapperContexts).toEqual(["metadata-test-operation"]);
		expect(registerTool).toHaveBeenCalledOnce();
		expect(registeredName).toBe("metadata-test");
		expect(registeredConfig).toMatchObject({
			description:
				"Read-only. Test tool summary. Aliases: test alias, alternate test alias. <use_case>Use to verify defineTool behavior.</use_case> <important_notes>Only used by unit tests.</important_notes>",
			outputSchema,
			annotations,
		});
		expect(registeredConfig?.inputSchema.safeParse({}).data).toEqual({
			page: 3,
		});
	});

	it("registers structured and legacy responses with defaults and one wrapper invocation", async () => {
		server = new McpServer({ name: "define-tool-test", version: "1.0.0" });
		client = new Client({ name: "define-tool-client", version: "1.0.0" });
		let wrapperApplications = 0;
		let handlerInvocations = 0;
		const wrapperContexts: string[] = [];
		const wrapper: typeof withErrorHandling = <
			TParams extends Record<string, unknown>,
			TResponse extends McpToolResponse,
		>(
			handler: (args: TParams) => Promise<TResponse>,
			context: string,
		) => {
			wrapperApplications += 1;
			wrapperContexts.push(context);
			return async (args: TParams) => {
				handlerInvocations += 1;
				return handler(args);
			};
		};

		defineTool(server, {
			name: "structured-test",
			description,
			inputSchema: { value: z.number().default(7) },
			outputSchema: { value: z.number() },
			annotations: readOnlyAnnotations("Structured Test"),
			wrapHandler: wrapper,
			handler: async ({ value }) =>
				createStructuredJsonResponse({ value }, { value }),
		});
		defineTool(server, {
			name: "legacy-test",
			description,
			inputSchema: { message: z.string().default("legacy response") },
			annotations: readOnlyAnnotations("Legacy Test"),
			wrapHandler: wrapper,
			handler: async ({ message }) => createTextResponse(message),
		});

		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await Promise.all([
			server.connect(serverTransport),
			client.connect(clientTransport),
		]);

		const { tools } = await client.listTools();
		const structuredTool = tools.find(({ name }) => name === "structured-test");
		const legacyTool = tools.find(({ name }) => name === "legacy-test");
		expect(structuredTool?.outputSchema).toBeDefined();
		expect(legacyTool?.outputSchema).toBeUndefined();

		const structuredResponse = await client.callTool({
			name: "structured-test",
			arguments: {},
		});
		expect(structuredResponse.structuredContent).toEqual({ value: 7 });
		expect(structuredResponse.content).toEqual([
			{ type: "text", text: '{\n  "value": 7\n}' },
		]);

		const legacyResponse = await client.callTool({
			name: "legacy-test",
			arguments: {},
		});
		expect(legacyResponse.structuredContent).toBeUndefined();
		expect(legacyResponse.content).toEqual([
			{ type: "text", text: "legacy response" },
		]);
		expect(wrapperApplications).toBe(2);
		expect(wrapperContexts).toEqual(["structured-test", "legacy-test"]);
		expect(handlerInvocations).toBe(2);
	});
});
