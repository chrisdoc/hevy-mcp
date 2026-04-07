import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startHttpServer } from "../../src/utils/httpServer.js";

function buildMinimalServer() {
	const server = new McpServer({ name: "test-server", version: "0.0.0" });
	server.registerTool(
		"noop",
		{ description: "A no-op tool for testing" },
		async () => ({ content: [] }),
	);
	return server;
}

describe("HTTP transport integration", () => {
	let httpServer: Server;
	let port: number;

	beforeEach(async () => {
		httpServer = await startHttpServer(buildMinimalServer, 0);
		const addr = httpServer.address();
		if (!addr || typeof addr === "string") throw new Error("No address");
		port = addr.port;
	});

	afterEach(
		() =>
			new Promise<void>((resolve, reject) => {
				httpServer.close((err) => (err ? reject(err) : resolve()));
			}),
	);

	it("client can connect and list tools", async () => {
		const url = new URL(`http://localhost:${port}/mcp`);
		const transport = new StreamableHTTPClientTransport(url);
		const client = new Client({ name: "test-client", version: "0.0.0" });
		await client.connect(transport);
		try {
			const result = await client.listTools();
			expect(result).toHaveProperty("tools");
			expect(Array.isArray(result.tools)).toBe(true);
			expect(result.tools.find((t) => t.name === "noop")).toBeDefined();
		} finally {
			await client.close();
		}
	});
});
