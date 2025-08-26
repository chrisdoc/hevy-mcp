import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpServer } from "./httpServer.js";

// Mock dependencies that are harder to test in isolation
vi.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => ({
	StreamableHTTPServerTransport: vi.fn(() => ({
		sessionId: "test-session-id",
		handleRequest: vi.fn(),
		onclose: null,
		close: vi.fn(),
	})),
}));

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
	isInitializeRequest: vi.fn(() => true),
}));

describe("HTTP Server", () => {
	let server: McpServer;

	beforeEach(() => {
		server = new McpServer({
			name: "test-server",
			version: "1.0.0",
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should create HTTP server with default options", () => {
		const httpServer = createHttpServer(server);

		expect(httpServer).toBeDefined();
		expect(httpServer.app).toBeDefined();
		expect(httpServer.startServer).toBeDefined();
		expect(httpServer.getActiveSessionsCount).toBeDefined();
		expect(httpServer.closeAllSessions).toBeDefined();
	});

	it("should create HTTP server with custom options", () => {
		const options = {
			port: 4000,
			host: "localhost",
			enableDnsRebindingProtection: true,
			allowedHosts: ["localhost", "127.0.0.1"],
		};

		const httpServer = createHttpServer(server, options);

		expect(httpServer).toBeDefined();
		expect(httpServer.app).toBeDefined();
	});

	it("should return active sessions count", () => {
		const httpServer = createHttpServer(server);

		expect(httpServer.getActiveSessionsCount()).toBe(0);
	});

	it("should close all sessions", () => {
		const httpServer = createHttpServer(server);

		// This should not throw
		expect(() => httpServer.closeAllSessions()).not.toThrow();
	});

	it("should have required endpoints configured", () => {
		const httpServer = createHttpServer(server);
		const app = httpServer.app;

		// Check that the app has the expected middleware and routes
		expect(app).toBeDefined();

		// We can't easily test the routes without starting the server,
		// but we can verify the app was created successfully
		expect(typeof app.listen).toBe("function");
	});
});
