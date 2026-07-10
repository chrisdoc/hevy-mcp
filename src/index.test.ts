import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
	isConnected: vi.fn(() => false),
	sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
	registerPrompt: vi.fn(),
	tool: vi.fn(),
	registerTool: vi.fn(),
	directRegisterToolCalls: 0,
	getUserInfo: vi.fn().mockResolvedValue({}),
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
	createClient: vi.fn(() => ({
		mockedClient: true,
		getUserInfo: testDoubles.getUserInfo,
	})),
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

vi.mock("./tools/user.js", () => ({
	registerUserTools: vi.fn((server: McpServer) => {
		testDoubles.directRegisterToolCalls += 1;
		server.registerTool("get-user-info", {}, vi.fn());
	}),
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
		isConnected = testDoubles.isConnected;
		sendLoggingMessage = testDoubles.sendLoggingMessage;
		registerPrompt = testDoubles.registerPrompt;
		tool = testDoubles.tool;
		registerTool = testDoubles.registerTool;
		registerResource = vi.fn();
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
		testDoubles.getUserInfo.mockResolvedValue({});
		testDoubles.directRegisterToolCalls = 0;
		testDoubles.tool.mockImplementation(
			function (this: { registerTool: () => void }) {
				this.registerTool();
			},
		);
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
		expect(testDoubles.registerPrompt).toHaveBeenCalledTimes(2);
		expect(
			testDoubles.registerPrompt.mock.calls.map(([prompt]) => prompt),
		).toEqual(["analyze-workout-progress", "create-workout-from-routine"]);
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

	it("reports the number of tool registration calls on the registration span", () => {
		createServer({ config: { apiKey: "test-key" } });

		const registrationCount = testDoubles.registerTool.mock.calls.length;
		expect(registrationCount).toBeGreaterThan(0);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.tools.count",
			registrationCount,
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

		it("validates HEVY_API_KEY before connecting stdio transport", async () => {
			const secret = "test-api-key";
			process.env = {
				...originalEnv,
				HEVY_API_KEY: secret,
			};
			process.argv = originalArgv.slice(0, 2);
			const errorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => undefined);
			const stdoutSpy = vi
				.spyOn(process.stdout, "write")
				.mockImplementation(() => true);

			await runServer();
			expect(testDoubles.getUserInfo).toHaveBeenCalledTimes(1);
			expect(testDoubles.getUserInfo.mock.invocationCallOrder[0]).toBeLessThan(
				testDoubles.connect.mock.invocationCallOrder[0] ?? Infinity,
			);
			expect(createClient).toHaveBeenNthCalledWith(
				1,
				"test-api-key",
				"https://api.hevyapp.com",
				{ maxGetRetries: 0, timeoutMs: 5_000 },
			);
			expect(createClient).toHaveBeenNthCalledWith(
				2,
				"test-api-key",
				"https://api.hevyapp.com",
				{ logger: expect.any(Function) },
			);
			expect(Sentry.setUser).toHaveBeenCalledWith({
				id: TEST_API_KEY_HMAC_SHA256,
			});
			expect(
				JSON.stringify(vi.mocked(Sentry.setUser).mock.calls),
			).not.toContain(secret);
			const renderedStderr = JSON.stringify(errorSpy.mock.calls);
			expect(renderedStderr).not.toContain(secret);
			expect(renderedStderr).not.toContain(
				"Skipped structured MCP client log because the server is not connected",
			);
			expect(stdoutSpy).not.toHaveBeenCalled();
			expect(testDoubles.isConnected).not.toHaveBeenCalled();
			expect(testDoubles.sendLoggingMessage).not.toHaveBeenCalled();
			const anyStdioModule = stdioModule as { __transports?: unknown[] };
			expect(anyStdioModule.__transports?.length).toBeGreaterThan(0);
			const spanNames = testDoubles.startActiveSpan.mock.calls.map(
				([name]) => name as string,
			);
			expect(spanNames).toContain("mcp.server.run");
			expect(spanNames).toContain("mcp.server.connect");
			errorSpy.mockRestore();
			stdoutSpy.mockRestore();
		});

		it("prefers CLI --hevy-api-key argument over environment variable", async () => {
			process.env = {
				...originalEnv,
				HEVY_API_KEY: "env-key",
			};
			process.argv = [...originalArgv.slice(0, 2), "--hevy-api-key=cli-key"];

			await runServer();
			expect(createClient).toHaveBeenNthCalledWith(
				1,
				"cli-key",
				"https://api.hevyapp.com",
				{ maxGetRetries: 0, timeoutMs: 5_000 },
			);
			expect(createClient).toHaveBeenNthCalledWith(
				2,
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

		it.each([401, 403])(
			"rejects a %s startup probe with only an actionable sanitized error",
			async (status) => {
				const secret = "secret-api-key";
				process.env = {
					...originalEnv,
					HEVY_API_KEY: secret,
				};
				process.argv = originalArgv.slice(0, 2);
				testDoubles.getUserInfo.mockRejectedValueOnce({
					message: `request failed for ${secret}`,
					response: {
						status,
						data: { apiKey: secret, detail: "raw response" },
					},
					config: { headers: { "api-key": secret } },
				});
				const errorSpy = vi
					.spyOn(console, "error")
					.mockImplementation(() => undefined);
				const stdoutSpy = vi
					.spyOn(process.stdout, "write")
					.mockImplementation(() => true);

				const error = await runServer().catch((caught: unknown) => caught);
				const renderedError = `${String(error)}\n${
					(error as Error).stack ?? ""
				}`;

				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toBe(
					"HEVY_API_KEY is invalid or expired. Please check your API key in the Hevy app under Settings > API Key.",
				);
				expect(renderedError).not.toContain(secret);
				expect(renderedError).not.toContain("raw response");
				expect(errorSpy).not.toHaveBeenCalled();
				expect(stdoutSpy).not.toHaveBeenCalled();
				expect(testDoubles.isConnected).not.toHaveBeenCalled();
				expect(testDoubles.sendLoggingMessage).not.toHaveBeenCalled();
				expect(testDoubles.connect).not.toHaveBeenCalled();
				expect(createClient).toHaveBeenCalledTimes(1);
				expect(createClient).toHaveBeenCalledWith(
					secret,
					"https://api.hevyapp.com",
					{ maxGetRetries: 0, timeoutMs: 5_000 },
				);
				errorSpy.mockRestore();
				stdoutSpy.mockRestore();
			},
		);

		it.each([
			["network failure", { code: "ETIMEDOUT" }],
			["HTTP 429", { response: { status: 429 } }],
		])(
			"warns and connects after a sanitized %s startup probe failure",
			async (_label, failure) => {
				const secret = "non-auth-failure-secret";
				process.env = {
					...originalEnv,
					HEVY_API_KEY: secret,
				};
				process.argv = originalArgv.slice(0, 2);
				testDoubles.getUserInfo.mockRejectedValueOnce({
					...failure,
					message: `request failed with ${secret}`,
					config: { headers: { "api-key": secret } },
				});
				const errorSpy = vi
					.spyOn(console, "error")
					.mockImplementation(() => undefined);
				const stdoutSpy = vi
					.spyOn(process.stdout, "write")
					.mockImplementation(() => true);

				await runServer();

				expect(errorSpy).toHaveBeenNthCalledWith(
					1,
					"Warning: HEVY_API_KEY could not be validated during startup. Startup will continue; check your network connection and Hevy API availability.",
				);
				expect(errorSpy).toHaveBeenNthCalledWith(
					2,
					"Hevy client initialized with API key",
				);
				expect(errorSpy).toHaveBeenNthCalledWith(
					3,
					"Starting MCP server in stdio mode",
				);
				expect(errorSpy).toHaveBeenCalledTimes(3);
				const renderedStderr = JSON.stringify(errorSpy.mock.calls);
				expect(renderedStderr).not.toContain(secret);
				expect(renderedStderr).not.toContain("ETIMEDOUT");
				expect(renderedStderr).not.toContain(
					"Skipped structured MCP client log because the server is not connected",
				);
				expect(stdoutSpy).not.toHaveBeenCalled();
				expect(testDoubles.isConnected).not.toHaveBeenCalled();
				expect(testDoubles.sendLoggingMessage).not.toHaveBeenCalled();
				expect(testDoubles.connect).toHaveBeenCalledTimes(1);
				expect(createClient).toHaveBeenNthCalledWith(
					1,
					secret,
					"https://api.hevyapp.com",
					{ maxGetRetries: 0, timeoutMs: 5_000 },
				);
				expect(createClient).toHaveBeenNthCalledWith(
					2,
					secret,
					"https://api.hevyapp.com",
					{ logger: expect.any(Function) },
				);
				errorSpy.mockRestore();
				stdoutSpy.mockRestore();
			},
		);

		it("fails missing-key startup on stderr without client, connect, or stdout", async () => {
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
			const errorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => undefined);
			const stdoutSpy = vi
				.spyOn(process.stdout, "write")
				.mockImplementation(() => true);

			await expect(runServer()).rejects.toThrow();
			expect(exitSpy).toHaveBeenCalledWith(1);
			expect(errorSpy).toHaveBeenCalledWith(
				"Hevy API key is required. Provide it via the HEVY_API_KEY environment variable.",
			);
			expect(stdoutSpy).not.toHaveBeenCalled();
			expect(createClient).not.toHaveBeenCalled();
			expect(testDoubles.getUserInfo).not.toHaveBeenCalled();
			expect(testDoubles.connect).not.toHaveBeenCalled();
			exitSpy.mockRestore();
			errorSpy.mockRestore();
			stdoutSpy.mockRestore();
		});
	});
});
