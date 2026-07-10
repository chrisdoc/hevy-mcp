import * as stdioModule from "@modelcontextprotocol/sdk/server/stdio.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import createServer, {
	configSchema,
	createServer as namedCreateServer,
	runServer,
} from "./index.js";
import { createClient } from "./utils/hevyClient.js";
import { Sentry } from "./utils/telemetry.js";

const originalEnv = { ...process.env };
const originalArgv = [...process.argv];
const TEST_KEY_HMAC_SHA256 = "2cb0b5f95a";
const TEST_API_KEY_HMAC_SHA256 = "0eefd4f47c";
const CLI_KEY_HMAC_SHA256 = "85a3f127af";

const testDoubles = vi.hoisted(() => ({
	span: {
		setAttribute: vi.fn(),
		setStatus: vi.fn(),
		recordException: vi.fn(),
		end: vi.fn(),
	},
	connect: vi.fn().mockResolvedValue(undefined),
	mcpServerConstructor: vi.fn(),
	sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
	sentry: {
		init: vi.fn(() => ({})),
		setUser: vi.fn(),
		wrapMcpServerWithSentry: vi.fn((server: unknown) => server),
		withScope: vi.fn((cb: (scope: unknown) => void) =>
			cb({ setTag: vi.fn(), setContext: vi.fn() }),
		),
		captureException: vi.fn(),
		validateOpenTelemetrySetup: vi.fn(),
		SentryContextManager: vi.fn(),
	},
	startActiveSpan: vi.fn((...args: unknown[]) => {
		const cb = args[args.length - 1] as (span: unknown) => unknown;
		return cb(testDoubles.span);
	}),
}));

vi.mock("./utils/hevyClient.js", () => ({
	createClient: vi.fn().mockReturnValue({ mockedClient: true }),
}));

vi.mock("./utils/telemetry.js", () => ({
	Sentry: testDoubles.sentry,
	tracer: {
		startActiveSpan: testDoubles.startActiveSpan,
	},
	meter: {
		createCounter: vi.fn(() => ({ add: vi.fn() })),
		createHistogram: vi.fn(() => ({ record: vi.fn() })),
	},
	serviceName: "hevy-mcp",
	serviceVersion: "dev",
	setCurrentUserId: vi.fn(),
	getCurrentUserId: vi.fn(() => undefined),
}));

vi.mock("./utils/metrics.js", () => ({
	toolInvocations: { add: vi.fn() },
	toolErrors: { add: vi.fn() },
	toolDuration: { record: vi.fn() },
	apiCalls: { add: vi.fn() },
	apiDuration: { record: vi.fn() },
	stdioParseErrors: { add: vi.fn() },
	serverStartups: { add: vi.fn() },
}));

vi.mock("@opentelemetry/api", () => ({
	SpanStatusCode: { OK: 1, ERROR: 2 },
	trace: { getTracer: vi.fn(() => ({ startActiveSpan: vi.fn() })) },
	metrics: {
		getMeter: vi.fn(() => ({
			createCounter: vi.fn(),
			createHistogram: vi.fn(),
		})),
	},
}));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
	class MockMcpServer {
		constructor(serverInfo: unknown, options: unknown) {
			testDoubles.mcpServerConstructor(serverInfo, options);
		}

		connect = testDoubles.connect;
		isConnected = vi.fn(() => true);
		sendLoggingMessage = testDoubles.sendLoggingMessage;
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
		expect(testDoubles.startActiveSpan).toHaveBeenCalledWith(
			"mcp.server.build",
			expect.objectContaining({
				attributes: expect.objectContaining({
					"mcp.server.name": "hevy-mcp",
				}),
			}),
			expect.any(Function),
		);
	});

	it("advertises logging capability and injects one client logger", () => {
		createServer({ config: { apiKey: "test-key" } });

		expect(testDoubles.mcpServerConstructor).toHaveBeenCalledWith(
			{ name: "hevy-mcp", version: "dev" },
			{ capabilities: { logging: {} } },
		);
		expect(createClient).toHaveBeenCalledWith(
			"test-key",
			"https://api.hevyapp.com",
			{ logger: expect.any(Function) },
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

	it("marks the build span as failed when the Hevy client cannot be initialized", () => {
		vi.mocked(createClient).mockImplementationOnce(() => {
			throw new Error("client init failed");
		});

		expect(() => createServer({ config: { apiKey: "test-key" } })).toThrow(
			"client init failed",
		);
		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({ code: 2 });
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
				expect(testDoubles.startActiveSpan).not.toHaveBeenCalled();

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
				expect(testDoubles.startActiveSpan).not.toHaveBeenCalled();

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
				{ logger: expect.any(Function) },
			);
			expect(Sentry.setUser).toHaveBeenCalledWith({
				id: TEST_API_KEY_HMAC_SHA256,
			});
			expect(
				JSON.stringify(vi.mocked(Sentry.setUser).mock.calls),
			).not.toContain("test-api-key");
			const anyStdioModule = stdioModule as { __transports?: unknown[] };
			expect(anyStdioModule.__transports?.length).toBeGreaterThan(0);
			const spanNames = testDoubles.startActiveSpan.mock.calls.map(
				([name]) => name as string,
			);
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
				{ logger: expect.any(Function) },
			);
			expect(Sentry.setUser).toHaveBeenCalledWith({
				id: CLI_KEY_HMAC_SHA256,
			});
			expect(
				JSON.stringify(vi.mocked(Sentry.setUser).mock.calls),
			).not.toContain("cli-key");
			expect(
				JSON.stringify(vi.mocked(Sentry.setUser).mock.calls),
			).not.toContain("env-key");
		});

		it("marks the connect span as failed when stdio connection throws", async () => {
			process.env = {
				...originalEnv,
				HEVY_API_KEY: "test-api-key",
			};
			process.argv = originalArgv.slice(0, 2);
			testDoubles.connect.mockRejectedValueOnce(new Error("connect failed"));

			await expect(runServer()).rejects.toThrow("connect failed");
			expect(testDoubles.connect).toHaveBeenCalled();
			expect(testDoubles.span.setStatus).toHaveBeenCalledWith({ code: 2 });
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
