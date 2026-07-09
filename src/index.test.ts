import * as Sentry from "@sentry/node";
import * as stdioModule from "@modelcontextprotocol/sdk/server/stdio.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import createServer, {
	configSchema,
	createServer as namedCreateServer,
	runServer,
} from "./index.js";
import { createClient } from "./utils/hevyClient.js";

const originalEnv = { ...process.env };
const originalArgv = [...process.argv];
const TEST_KEY_HMAC_SHA256 =
	"2cb0b5f95a4652a38a004b9767aa14cea59feb62eb9252ef5fe7f64afd6b6b27";
const TEST_API_KEY_HMAC_SHA256 =
	"0eefd4f47c434138f560075be1eedfca27256a782534f3f254781d736cbd468c";
const CLI_KEY_HMAC_SHA256 =
	"85a3f127af4cea435cd358405c5298016946cc3f4e196552c2f1e435c2c6f1b3";

vi.mock("./utils/hevyClient.js", () => ({
	createClient: vi.fn().mockReturnValue({ mockedClient: true }),
}));

vi.mock("@sentry/node", () => ({
	init: vi.fn(),
	setUser: vi.fn(),
	wrapMcpServerWithSentry: vi.fn((server) => server),
	startSpan: vi.fn((_, callback) =>
		callback({
			setAttribute: vi.fn(),
			setStatus: vi.fn(),
		}),
	),
}));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
	class MockMcpServer {
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
		expect(Sentry.startSpan).toHaveBeenCalledWith(
			expect.objectContaining({ name: "mcp.server.build" }),
			expect.any(Function),
		);
	});

	it("exports createServer as both default and named exports", () => {
		expect(namedCreateServer).toBe(createServer);
		const server = namedCreateServer({ config: { apiKey: "named-key" } });
		expect(server).toBeDefined();
	});

	it("sets the Sentry user ID to an HMAC-SHA-256 fingerprint of the API key", () => {
		createServer({ config: { apiKey: "test-key" } });

		expect(Sentry.setUser).toHaveBeenCalledWith({ id: TEST_KEY_HMAC_SHA256 });
		expect(JSON.stringify(vi.mocked(Sentry.setUser).mock.calls)).not.toContain(
			"test-key",
		);
	});

	describe("runServer", () => {
		it.each(["--version", "-v"])(
			"prints version for %s and exits before server startup",
			async (flag) => {
				process.env = {
					...originalEnv,
					HEVY_API_KEY: "test-api-key",
				};
				process.argv = [...originalArgv.slice(0, 2), flag];

				const logSpy = vi
					.spyOn(console, "log")
					.mockImplementation(() => undefined);

				await runServer();

				expect(logSpy).toHaveBeenCalledWith("dev");
				expect(createClient).not.toHaveBeenCalled();
				expect(Sentry.startSpan).not.toHaveBeenCalled();

				const anyStdioModule = stdioModule as { __transports?: unknown[] };
				expect(anyStdioModule.__transports).toHaveLength(0);

				logSpy.mockRestore();
			},
		);

		it.each(["--help", "-h"])(
			"prints help for %s and exits before server startup",
			async (flag) => {
				process.env = {
					...originalEnv,
					HEVY_API_KEY: "test-api-key",
				};
				process.argv = [...originalArgv.slice(0, 2), flag];

				const logSpy = vi
					.spyOn(console, "log")
					.mockImplementation(() => undefined);

				await runServer();

				expect(logSpy).toHaveBeenCalledTimes(1);
				const [helpText] = logSpy.mock.calls[0] ?? [];
				expect(helpText).toContain("Usage:");
				expect(helpText).toContain("HEVY_API_KEY");
				expect(helpText).toContain("Examples:");
				expect(createClient).not.toHaveBeenCalled();
				expect(Sentry.startSpan).not.toHaveBeenCalled();

				const anyStdioModule = stdioModule as { __transports?: unknown[] };
				expect(anyStdioModule.__transports).toHaveLength(0);

				logSpy.mockRestore();
			},
		);

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
			expect(Sentry.setUser).toHaveBeenCalledWith({
				id: TEST_API_KEY_HMAC_SHA256,
			});
			expect(
				JSON.stringify(vi.mocked(Sentry.setUser).mock.calls),
			).not.toContain("test-api-key");
			const anyStdioModule = stdioModule as { __transports?: unknown[] };
			expect(anyStdioModule.__transports?.length).toBeGreaterThan(0);
			const spanNames = vi
				.mocked(Sentry.startSpan)
				.mock.calls.map(([options]) => (options as { name?: string }).name);
			expect(spanNames).toContain("mcp.server.run");
			expect(spanNames).toContain("mcp.server.connect");
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
			expect(Sentry.setUser).toHaveBeenCalledWith({ id: CLI_KEY_HMAC_SHA256 });
			expect(
				JSON.stringify(vi.mocked(Sentry.setUser).mock.calls),
			).not.toContain("cli-key");
			expect(
				JSON.stringify(vi.mocked(Sentry.setUser).mock.calls),
			).not.toContain("env-key");
		});

		it("exits the process when no API key is provided", async () => {
			process.env = {
				...originalEnv,
				HEVY_API_KEY: "",
			};
			process.argv = originalArgv.slice(0, 2);

			const exitSpy = vi
				.spyOn(process, "exit")
				.mockImplementation((code?: string | number | null) => {
					expect(code).toBe(1);
					throw new Error("process.exit called");
				});

			await expect(runServer()).rejects.toThrow();
			expect(exitSpy).toHaveBeenCalledWith(1);
			exitSpy.mockRestore();
		});
	});
});
