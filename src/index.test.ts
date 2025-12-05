import * as stdioModule from "@modelcontextprotocol/sdk/server/stdio.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import createServer, { configSchema, runServer } from "./index.js";
import { createClient } from "./utils/hevyClient.js";

const originalEnv = { ...process.env };
const originalArgv = [...process.argv];

vi.mock("./utils/hevyClient.js", () => ({
	createClient: vi.fn().mockReturnValue({ mockedClient: true }),
}));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
	class MockMcpServer {
		server = { mockServer: true };
		connect = vi.fn().mockResolvedValue(undefined);
		tool = vi.fn();
	}

	return {
		McpServer: MockMcpServer,
	};
});

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => {
	const transports: unknown[] = [];
	class MockStdioServerTransport {
		constructor() {
			transports.push(this);
		}
	}

	return {
		StdioServerTransport: MockStdioServerTransport,
		__transports: transports,
	};
});

describe("Server entry", () => {
	beforeEach(() => {
		process.env = { ...originalEnv };
		process.argv = [...originalArgv];
		vi.clearAllMocks();
		const anyStdioModule = stdioModule as { __transports?: unknown[] };
		if (anyStdioModule.__transports) {
			anyStdioModule.__transports.length = 0;
		}
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		process.argv = [...originalArgv];
	});

	it("validates HEVY_API_KEY via configSchema", () => {
		expect(() => configSchema.parse({ apiKey: "" })).toThrow();
		const parsed = configSchema.parse({ apiKey: "abc" });
		expect(parsed.apiKey).toBe("abc");
	});

	it("creates an MCP server instance", () => {
		const server = createServer({ config: { apiKey: "test-key" } });
		expect(server).toBeDefined();
	});

	describe("runServer", () => {
		it("uses HEVY_API_KEY from the environment and connects stdio transport", async () => {
			process.env = {
				...originalEnv,
				HEVY_API_KEY: "test-api-key",
			};
			process.argv = originalArgv.slice(0, 2);

			await runServer();
			expect(createClient).toHaveBeenCalledWith(
				"test-api-key",
				"https://api.hevyapp.com",
			);
			const anyStdioModule = stdioModule as { __transports?: unknown[] };
			expect(anyStdioModule.__transports?.length).toBeGreaterThan(0);
		});

		it("prefers CLI --hevy-api-key argument over environment variable", async () => {
			process.env = {
				...originalEnv,
				HEVY_API_KEY: "env-key",
			};
			process.argv = [...originalArgv.slice(0, 2), "--hevy-api-key=cli-key"];

			await runServer();
			expect(createClient).toHaveBeenCalledWith(
				"cli-key",
				"https://api.hevyapp.com",
			);
		});

		it("exits the process when no API key is provided", async () => {
			process.env = {
				...originalEnv,
				HEVY_API_KEY: "",
			};
			process.argv = originalArgv.slice(0, 2);

			const exitSpy = vi
				.spyOn(process, "exit")
				.mockImplementation((_code?: number) => {
					throw new Error("process.exit called");
				});

			await expect(runServer()).rejects.toThrow();
			expect(exitSpy).toHaveBeenCalledWith(1);
			exitSpy.mockRestore();
		});
	});
});
