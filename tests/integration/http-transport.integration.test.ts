import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHttpServer } from "../../src/utils/httpServer.js";

describe("HTTP Transport Integration", () => {
	let server: McpServer;
	let httpServer: ReturnType<typeof createHttpServer>;
	let serverInstance: unknown;

	beforeAll(async () => {
		// Create a minimal server for testing
		server = new McpServer({
			name: "test-hevy-mcp",
			version: "1.0.0",
		});

		// Add a simple test tool
		server.tool("test-tool", "A test tool", {}, async () => {
			return {
				content: [
					{
						type: "text",
						text: "Test response",
					},
				],
			};
		});

		// Create HTTP server
		httpServer = createHttpServer(server, {
			port: 3001, // Use different port to avoid conflicts
			host: "127.0.0.1",
		});

		// Start the server
		await httpServer.startServer();
	});

	afterAll(async () => {
		if (serverInstance) {
			await new Promise<void>((resolve) => {
				serverInstance.close(() => resolve());
			});
		}

		// Clean up sessions
		httpServer?.closeAllSessions();
	});

	it("should respond to health check", async () => {
		const response = await fetch("http://127.0.0.1:3001/health");
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.status).toBe("ok");
		expect(data.timestamp).toBeDefined();
	});

	it("should handle session management", () => {
		expect(httpServer.getActiveSessionsCount()).toBe(0);

		// Test cleanup method doesn't throw
		expect(() => httpServer.closeAllSessions()).not.toThrow();
	});

	it("should return 400 for invalid MCP requests", async () => {
		const response = await fetch("http://127.0.0.1:3001/mcp", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ invalid: "request" }),
		});

		expect(response.status).toBe(400);
	});

	it("should handle GET requests without session ID", async () => {
		const response = await fetch("http://127.0.0.1:3001/mcp", {
			method: "GET",
		});

		expect(response.status).toBe(400);
		expect(await response.text()).toBe("Invalid or missing session ID");
	});

	it("should handle DELETE requests without session ID", async () => {
		const response = await fetch("http://127.0.0.1:3001/mcp", {
			method: "DELETE",
		});

		expect(response.status).toBe(400);
		expect(await response.text()).toBe("Invalid or missing session ID");
	});
});
