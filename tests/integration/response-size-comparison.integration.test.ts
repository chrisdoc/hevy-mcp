import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { encode } from "@toon-format/toon";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createJsonResponse } from "../../src/utils/response-formatter.js";

const TEST_DATA = {
	users: Array.from({ length: 25 }, (_, i) => ({
		id: i + 1,
		name: `User ${i + 1}`,
		role: i % 2 === 0 ? "admin" : "user",
	})),
} as const;

describe("MCP JSON output size comparison", () => {
	let server: McpServer | null = null;
	let client: Client | null = null;

	beforeAll(async () => {
		server = new McpServer({
			name: "hevy-mcp-size-comparison-test",
			version: "1.0.0",
		});

		server.tool(
			"size-comparison-json",
			"Returns a deterministic JSON payload for output-size comparisons",
			{},
			async () => createJsonResponse(TEST_DATA),
		);

		client = new Client({
			name: "hevy-mcp-size-comparison-test-client",
			version: "1.0.0",
		});

		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await Promise.all([
			client.connect(clientTransport),
			server.connect(serverTransport),
		]);
	});

	afterAll(async () => {
		await client?.close();
		await server?.close();
	});

	it("should print and validate the size difference vs toon", async () => {
		if (!client) throw new Error("Client not initialized");

		const result = await client.request(
			{
				method: "tools/call",
				params: {
					name: "size-comparison-json",
					arguments: {},
				},
			},
			CallToolResultSchema,
		);

		const textBlock = result.content.find((c) => c.type === "text");
		if (!textBlock) {
			throw new Error("Expected at least one text content block");
		}

		const json = textBlock.text;
		const parsed = JSON.parse(json) as typeof TEST_DATA;
		expect(parsed).toEqual(TEST_DATA);

		const toon = encode(parsed);

		const delta = json.length - toon.length;
		console.info(
			`mcp json size comparison: json=${json.length} toon=${toon.length} delta=${delta}`,
		);

		expect(toon.length).toBeGreaterThan(0);
		expect(json.length).toBeGreaterThan(0);
	});
});
