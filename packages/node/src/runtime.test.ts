import { SpanStatusCode, trace } from "@opentelemetry/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testDoubles = vi.hoisted(() => {
	const span = {
		addEvent: vi.fn(),
		setAttribute: vi.fn(),
		setAttributes: vi.fn(),
		setStatus: vi.fn(),
		end: vi.fn(),
	};
	const sdkProtocol = {
		onerror: undefined as ((error: Error) => void) | undefined,
		_requestHandlers: new Map<
			string,
			(request: object, extra: object) => Promise<object>
		>(),
	};
	const server = {
		connect: vi.fn().mockImplementation(() => Promise.resolve()),
		close: vi.fn().mockImplementation(() => Promise.resolve()),
		server: sdkProtocol,
		createToolError: undefined as ((message: string) => unknown) | undefined,
	};
	const startupClient = {
		getUserInfo: vi.fn().mockResolvedValue({ id: "user" }),
	};
	const runtimeClient = { kind: "runtime-client" };
	const httpHandle = {
		close: vi.fn().mockImplementation(() => Promise.resolve()),
	};

	return {
		server,
		span,
		sdkProtocol,
		startupClient,
		runtimeClient,
		httpHandle,
		transport: { kind: "stdio-transport" },
		createHevyClient: vi.fn(),
		createHevyMcpServer: vi.fn(),
		startStreamableHttpServer: vi.fn(),
		captureFailure: vi.fn(),
		installProcessExceptionTracking: vi.fn(() => vi.fn()),
		flushTelemetry: vi.fn().mockImplementation(() => Promise.resolve()),
		serverStartups: { add: vi.fn() },
		installGracefulShutdown: vi.fn(),
		instrumentTransport: vi.fn(() => ({ kind: "stdio-transport" })),
		scheduleUpdateCheck: vi.fn(),
		recordSessionTermination: vi.fn(),
		resolveTerminationCategory: vi.fn(() => "clean"),
		createNodeHevyClientOptions: vi.fn(() => ({
			onRequestComplete: vi.fn(),
		})),
		createNodeCacheObserver: vi.fn(() => ({ start: vi.fn() })),
		createNodeToolObserver: vi.fn(() => ({ kind: "observer" })),
	};
});

vi.mock("./utils/telemetry.js", () => ({
	captureFailure: testDoubles.captureFailure,
	flushTelemetry: testDoubles.flushTelemetry,
	tracer: {
		startActiveSpan: vi.fn((...args: unknown[]) => {
			const callback = args.at(-1) as (
				span: typeof testDoubles.span,
			) => unknown;
			return callback(testDoubles.span);
		}),
	},
	serviceName: "hevy-mcp",
	serviceVersion: "3.4.1",
	installProcessExceptionTracking: testDoubles.installProcessExceptionTracking,
}));

vi.mock("./utils/metrics.js", () => ({
	serverStartups: testDoubles.serverStartups,
}));

vi.mock("@hevy-mcp/hevy-client", () => ({
	createHevyClient: testDoubles.createHevyClient,
	isHevyHttpError: (error: object) =>
		Boolean(
			error &&
			typeof error === "object" &&
			"isHevyHttpError" in error &&
			error.isHevyHttpError === true,
		),
}));
vi.mock("@hevy-mcp/core", () => ({
	createHevyMcpServer: testDoubles.createHevyMcpServer,
	createSafeErrorDiagnostic: vi.fn(() => ({ category: "Error" })),
	mergeAbortSignals: (...signals: Array<AbortSignal | undefined>) => {
		const active = signals.filter(
			(signal): signal is AbortSignal => signal !== undefined,
		);
		if (active.length <= 1) return active[0];
		return AbortSignal.any(active);
	},
	ErrorType: {
		UNKNOWN_ERROR: "UNKNOWN_ERROR",
		VALIDATION_ERROR: "VALIDATION_ERROR",
	},
}));

vi.mock("@modelcontextprotocol/server/stdio", () => ({
	StdioServerTransport: class StdioServerTransport {
		readonly isTestDouble = true;
	},
}));

vi.mock("./utils/streamable-http.js", () => ({
	startStreamableHttpServer: testDoubles.startStreamableHttpServer,
}));

vi.mock("./utils/graceful-shutdown.js", () => ({
	installGracefulShutdown: testDoubles.installGracefulShutdown,
}));

vi.mock("./utils/hevy-client-observability.js", () => ({
	createNodeHevyClientOptions: testDoubles.createNodeHevyClientOptions,
	createNodeCacheObserver: testDoubles.createNodeCacheObserver,
}));

vi.mock("./utils/tool-observer.js", () => ({
	createNodeToolObserver: testDoubles.createNodeToolObserver,
}));

vi.mock("./utils/stdio-observability.js", () => ({
	createInstrumentedStdioTransport: testDoubles.instrumentTransport,
}));

vi.mock("./utils/mcp-session-observability.js", () => ({
	getCurrentMcpSessionId: vi.fn(() => "test-session"),
	getCurrentMcpTransport: vi.fn(() => "stdio"),
	recordMcpSessionTermination: testDoubles.recordSessionTermination,
	resolveSessionTerminationCategory: testDoubles.resolveTerminationCategory,
}));

vi.mock("./utils/version-check.js", () => ({
	scheduleUpdateCheck: testDoubles.scheduleUpdateCheck,
}));

import { createNodeMcpServer, runServer, runStdioServer } from "./runtime.js";

const originalArgv = [...process.argv];
const originalApiKey = process.env.HEVY_API_KEY;

function configureSuccessfulConstruction(): void {
	testDoubles.createHevyClient.mockImplementation(
		(options: { maxGetRetries?: number }) =>
			options.maxGetRetries === 0
				? testDoubles.startupClient
				: testDoubles.runtimeClient,
	);
	testDoubles.createHevyMcpServer.mockImplementation(
		(options: {
			createClient: (context: { onLog: () => void }) => unknown;
			decorateServer?: (server: typeof testDoubles.server) => unknown;
			onToolsRegistered?: (count: number) => void;
		}) => {
			options.decorateServer?.(testDoubles.server);
			options.createClient({ onLog: vi.fn() });
			options.onToolsRegistered?.(25);
			return testDoubles.server;
		},
	);
}

describe("Node package entrypoint", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		testDoubles.sdkProtocol._requestHandlers.clear();
		testDoubles.sdkProtocol.onerror = undefined;
		testDoubles.server.createToolError = undefined;
		testDoubles.server.connect.mockImplementation(() => Promise.resolve());
		testDoubles.startupClient.getUserInfo.mockResolvedValue({ id: "user" });
		configureSuccessfulConstruction();
		testDoubles.startStreamableHttpServer.mockResolvedValue(
			testDoubles.httpHandle,
		);
		process.argv = [originalArgv[0] ?? "node", "hevy-mcp"];
		delete process.env.HEVY_API_KEY;
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(console, "log").mockImplementation(() => undefined);
	});

	afterEach(() => {
		process.argv = [...originalArgv];
		if (originalApiKey === undefined) {
			delete process.env.HEVY_API_KEY;
		} else {
			process.env.HEVY_API_KEY = originalApiKey;
		}
		vi.restoreAllMocks();
	});

	it("constructs an unconnected decorated server from explicit options", async () => {
		process.env.HEVY_API_KEY = "environment-key-sentinel";

		await expect(
			createNodeMcpServer({ apiKey: "programmatic-key" }),
		).resolves.toBe(testDoubles.server);
		expect(testDoubles.createHevyClient).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				apiKey: "programmatic-key",
				baseUrl: "https://api.hevyapp.com",
				maxGetRetries: 0,
				timeoutMs: 5_000,
			}),
		);
		expect(testDoubles.createHevyClient).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				apiKey: "programmatic-key",
				onLog: expect.any(Function),
				onRequestComplete: expect.any(Function),
			}),
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.tools.count",
			25,
		);
		expect(testDoubles.createNodeToolObserver).toHaveBeenCalledWith({
			userHash: "0b633a8f53",
		});
		expect(
			JSON.stringify(testDoubles.createNodeToolObserver.mock.calls),
		).not.toContain("programmatic-key");
		expect(testDoubles.server.connect).not.toHaveBeenCalled();
	});
	it("enriches initialize and tool SDK spans", async () => {
		const initializeHandler = vi
			.fn()
			.mockResolvedValue({ protocolVersion: "1" });
		const toolHandler = vi.fn().mockResolvedValue({});
		testDoubles.sdkProtocol._requestHandlers.set(
			"initialize",
			initializeHandler,
		);
		testDoubles.sdkProtocol._requestHandlers.set("tools/call", toolHandler);

		await expect(createNodeMcpServer({ apiKey: "valid-key" })).resolves.toBe(
			testDoubles.server,
		);

		const wrappedToolHandler =
			testDoubles.sdkProtocol._requestHandlers.get("tools/call");
		const wrappedInitializeHandler =
			testDoubles.sdkProtocol._requestHandlers.get("initialize");
		if (!wrappedToolHandler || !wrappedInitializeHandler) {
			throw new Error("Expected SDK handlers to be installed");
		}

		const activeSpanSpy = vi
			.spyOn(trace, "getActiveSpan")
			.mockReturnValue(testDoubles.span as never);
		await expect(wrappedInitializeHandler({}, {})).resolves.toEqual({
			protocolVersion: "1",
		});
		expect(testDoubles.span.setAttributes).toHaveBeenCalledWith({
			"mcp.span.category": "protocol",
			"mcp.transport": "stdio",
		});
		expect(testDoubles.span.setAttributes).not.toHaveBeenCalledWith(
			expect.objectContaining({ "mcp.session.id": expect.anything() }),
		);
		testDoubles.span.setAttributes.mockClear();

		await expect(
			wrappedToolHandler({ params: { name: "get-workouts" } }, {}),
		).resolves.toEqual({});
		expect(testDoubles.span.setAttributes).toHaveBeenCalledWith({
			"mcp.span.category": "protocol",
			"mcp.transport": "stdio",
			"mcp.operation.kind": "tool",
			"mcp.tool.name": "get-workouts",
			"mcp.session.id": "test-session",
		});
		activeSpanSpy.mockRestore();
	});

	it("tracks SDK tool and discovery outcomes", async () => {
		const toolHandler = vi
			.fn()
			.mockResolvedValueOnce({ isError: true })
			.mockRejectedValueOnce(new Error("tool failure"));
		const discoveryHandler = vi
			.fn()
			.mockResolvedValueOnce({ capabilities: [] })
			.mockRejectedValueOnce(new Error("discovery failure"));
		testDoubles.sdkProtocol._requestHandlers.set("tools/call", toolHandler);
		testDoubles.sdkProtocol._requestHandlers.set(
			"server/discover",
			discoveryHandler,
		);
		await createNodeMcpServer({ apiKey: "valid-key" });
		const wrappedToolHandler =
			testDoubles.sdkProtocol._requestHandlers.get("tools/call");
		const wrappedDiscoveryHandler =
			testDoubles.sdkProtocol._requestHandlers.get("server/discover");
		if (!wrappedToolHandler || !wrappedDiscoveryHandler) {
			throw new Error("Expected SDK handlers to be installed");
		}

		await expect(
			wrappedToolHandler({ params: { name: "get-workouts" } }, {}),
		).resolves.toEqual({ isError: true });
		await expect(
			wrappedToolHandler({ params: { name: "bad name" } }, {}),
		).rejects.toThrow("tool failure");
		await expect(wrappedDiscoveryHandler({}, {})).resolves.toEqual({
			capabilities: [],
		});
		await expect(wrappedDiscoveryHandler({}, {})).rejects.toThrow(
			"discovery failure",
		);

		expect(testDoubles.captureFailure).toHaveBeenCalled();
	});

	it("treats unknown MCP tool requests as expected validation failures", async () => {
		const unknownToolError = new Error("Tool get-workout-workoutId not found");
		const toolHandler = vi.fn().mockRejectedValue(unknownToolError);
		testDoubles.sdkProtocol._requestHandlers.set("tools/call", toolHandler);
		await createNodeMcpServer({ apiKey: "valid-key" });

		const wrappedToolHandler =
			testDoubles.sdkProtocol._requestHandlers.get("tools/call");
		if (!wrappedToolHandler) {
			throw new Error("Expected wrapped tools/call handler to be installed");
		}

		testDoubles.captureFailure.mockClear();
		testDoubles.span.addEvent.mockClear();
		testDoubles.span.setStatus.mockClear();
		const activeSpanSpy = vi
			.spyOn(trace, "getActiveSpan")
			.mockReturnValue(testDoubles.span as never);

		await expect(
			wrappedToolHandler({ params: { name: "get-workout-workoutId" } }, {}),
		).rejects.toThrow("Tool get-workout-workoutId not found");

		expect(testDoubles.captureFailure).toHaveBeenCalledWith(
			unknownToolError,
			expect.objectContaining({
				expected: true,
				attributes: expect.objectContaining({
					"mcp.tool.name": "get-workout-workoutId",
					"mcp.validation.kind": "tool_not_found",
				}),
			}),
		);
		expect(testDoubles.span.setStatus).not.toHaveBeenCalledWith({
			code: SpanStatusCode.ERROR,
		});
		activeSpanSpy.mockRestore();
	});

	it("tracks SDK validation and protocol failures", async () => {
		const previousOnError = vi.fn(() => {
			throw new Error("previous SDK handler failure");
		});
		const createToolError = vi.fn((message: string) => ({ message }));
		testDoubles.sdkProtocol.onerror = previousOnError;
		testDoubles.server.createToolError = createToolError;
		await createNodeMcpServer({ apiKey: "valid-key" });

		testDoubles.sdkProtocol.onerror?.(new Error("protocol failure"));
		const activeSpanSpy = vi
			.spyOn(trace, "getActiveSpan")
			.mockReturnValue(testDoubles.span as never);
		testDoubles.server.createToolError?.("invalid tool");
		testDoubles.sdkProtocol.onerror?.(new Error("active protocol failure"));

		expect(testDoubles.span.addEvent).toHaveBeenCalledWith(
			"mcp.tool.failure",
			expect.objectContaining({
				"mcp.tool.name": "unknown",
				"mcp.failure.phase": "sdk",
				"error.type": "VALIDATION_ERROR",
				"error.category": "McpSdkValidationFailure",
			}),
		);
		expect(testDoubles.captureFailure).toHaveBeenCalled();
		expect(testDoubles.captureFailure).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				expected: false,
				attributes: expect.objectContaining({
					"mcp.tool.name": "unknown",
					"mcp.validation.kind": "unknown",
				}),
			}),
		);
		expect(createToolError).toHaveBeenCalledWith("invalid tool");
		expect(previousOnError).toHaveBeenCalledTimes(2);
		activeSpanSpy.mockRestore();
	});

	it("does not report expected SDK caller errors as Sentry issues", async () => {
		const createToolError = vi.fn((message: string) => ({ message }));
		testDoubles.server.createToolError = createToolError;
		await createNodeMcpServer({ apiKey: "valid-key" });

		const activeSpanSpy = vi
			.spyOn(trace, "getActiveSpan")
			.mockReturnValue(testDoubles.span as never);
		testDoubles.captureFailure.mockClear();
		testDoubles.span.setStatus.mockClear();
		testDoubles.server.createToolError?.(
			"Input validation error: Invalid arguments for tool get-workouts",
		);
		testDoubles.server.createToolError?.("Tool get-workout-by-id not found");

		expect(testDoubles.captureFailure).toHaveBeenNthCalledWith(
			1,
			expect.any(Error),
			expect.objectContaining({
				expected: true,
				attributes: expect.objectContaining({
					"mcp.tool.name": "get-workouts",
					"mcp.validation.kind": "input",
				}),
			}),
		);
		expect(testDoubles.captureFailure).toHaveBeenNthCalledWith(
			2,
			expect.any(Error),
			expect.objectContaining({
				expected: true,
				attributes: expect.objectContaining({
					"mcp.tool.name": "get-workout-by-id",
					"mcp.validation.kind": "tool_not_found",
				}),
			}),
		);
		expect(testDoubles.span.setStatus).not.toHaveBeenCalledWith({
			code: SpanStatusCode.ERROR,
		});
		activeSpanSpy.mockRestore();
	});

	it("keeps expected SDK result spans out of error status", async () => {
		const createToolError = vi.fn((message: string) => ({ message }));
		testDoubles.server.createToolError = createToolError;
		testDoubles.sdkProtocol._requestHandlers.set(
			"tools/call",
			vi.fn().mockImplementation(() => {
				testDoubles.server.createToolError?.(
					"Input validation error: Invalid arguments for tool get-workouts",
				);
				return { isError: true };
			}),
		);
		await createNodeMcpServer({ apiKey: "valid-key" });

		const wrappedToolHandler =
			testDoubles.sdkProtocol._requestHandlers.get("tools/call");
		if (!wrappedToolHandler) {
			throw new Error("Expected wrapped tools/call handler to be installed");
		}
		const activeSpanSpy = vi
			.spyOn(trace, "getActiveSpan")
			.mockReturnValue(testDoubles.span as never);
		testDoubles.span.setStatus.mockClear();

		await expect(
			wrappedToolHandler({ params: { name: "get-workouts" } }, {}),
		).resolves.toEqual({ isError: true });
		expect(testDoubles.span.setStatus).not.toHaveBeenCalledWith({
			code: SpanStatusCode.ERROR,
		});
		activeSpanSpy.mockRestore();
	});

	it("keeps SDK span enrichment best-effort and transport-aware", async () => {
		const initializeHandler = vi.fn().mockResolvedValue({});
		const toolHandler = vi.fn().mockResolvedValue({});
		testDoubles.sdkProtocol._requestHandlers.set(
			"initialize",
			initializeHandler,
		);
		testDoubles.sdkProtocol._requestHandlers.set("tools/call", toolHandler);
		const activeSpanSpy = vi
			.spyOn(trace, "getActiveSpan")
			.mockReturnValue(testDoubles.span as never);
		testDoubles.span.setAttributes.mockImplementationOnce(() => {
			throw new Error("telemetry unavailable");
		});

		await expect(
			createNodeMcpServer({ apiKey: "valid-key" }, "http"),
		).resolves.toBe(testDoubles.server);
		const wrappedInitialize =
			testDoubles.sdkProtocol._requestHandlers.get("initialize");
		const wrappedTool =
			testDoubles.sdkProtocol._requestHandlers.get("tools/call");
		if (!wrappedInitialize || !wrappedTool) {
			throw new Error("Expected SDK handlers to be installed");
		}

		await expect(wrappedInitialize({}, {})).resolves.toEqual({});
		await expect(
			wrappedTool({ params: { name: "get-workouts" } }, {}),
		).resolves.toEqual({});
		expect(initializeHandler).toHaveBeenCalledOnce();
		expect(toolHandler).toHaveBeenCalledOnce();
		expect(testDoubles.span.setAttributes).toHaveBeenLastCalledWith(
			expect.objectContaining({
				"mcp.span.category": "protocol",
				"mcp.transport": "http",
				"mcp.session.id": "test-session",
			}),
		);
		activeSpanSpy.mockRestore();
	});

	it("sanitizes HTTP and malformed startup diagnostics", async () => {
		testDoubles.startupClient.getUserInfo.mockRejectedValueOnce({
			response: { status: 503 },
		});
		await expect(createNodeMcpServer({ apiKey: "valid-key" })).resolves.toBe(
			testDoubles.server,
		);
		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining("Diagnostic: HTTP 503"),
		);

		vi.mocked(console.error).mockClear();
		testDoubles.startupClient.getUserInfo.mockRejectedValueOnce({
			response: {},
		});
		await expect(createNodeMcpServer({ apiKey: "valid-key" })).resolves.toBe(
			testDoubles.server,
		);
		expect(console.error).not.toHaveBeenCalledWith(
			expect.stringContaining("Diagnostic: HTTP"),
		);
	});
	it("validates the HTTP key once and builds sessions without re-probing", async () => {
		process.env.HEVY_API_KEY = "runtime-key";
		process.argv.push("--transport", "http");
		testDoubles.startStreamableHttpServer.mockImplementationOnce(
			async (
				_options: object,
				_apiKey: string,
				factory: (params: { apiKey: string }) => Promise<unknown>,
			) => {
				await factory({ apiKey: "runtime-key" });
				return testDoubles.httpHandle;
			},
		);

		await runServer();
		const options = testDoubles.installGracefulShutdown.mock.calls[0]?.[0] as {
			onComplete: (succeeded: boolean) => Promise<void>;
		};
		await options.onComplete(true);

		expect(testDoubles.startupClient.getUserInfo).toHaveBeenCalledOnce();
		expect(testDoubles.createHevyMcpServer).toHaveBeenCalledOnce();
		expect(testDoubles.installGracefulShutdown).toHaveBeenCalledWith(
			expect.objectContaining({ target: testDoubles.httpHandle }),
		);
		expect(testDoubles.flushTelemetry).toHaveBeenCalledOnce();
	});

	it("dispatches the default transport through runServer", async () => {
		process.env.HEVY_API_KEY = "runtime-key";
		await runServer();
		expect(testDoubles.server.connect).toHaveBeenCalledWith(
			testDoubles.transport,
		);
	});

	it("reports missing runtime keys through the lifecycle failure path", async () => {
		await expect(runStdioServer()).rejects.toThrow("Hevy API key is required");
		expect(testDoubles.recordSessionTermination).toHaveBeenCalledWith(
			"startup_failure",
		);
	});

	it.each([401, 403])(
		"rejects a startup probe returning HTTP %s with the stable key message",
		async (status) => {
			testDoubles.startupClient.getUserInfo.mockRejectedValueOnce({
				isHevyHttpError: true,
				status,
			});

			await expect(
				createNodeMcpServer({ apiKey: "invalid-key" }),
			).rejects.toThrow("HEVY_API_KEY is invalid or expired");
			expect(testDoubles.createHevyMcpServer).not.toHaveBeenCalled();
		},
	);

	it("reports construction failures through the startup span", async () => {
		testDoubles.createHevyMcpServer.mockImplementationOnce(() => {
			throw new Error("construction failure");
		});
		await expect(createNodeMcpServer({ apiKey: "valid-key" })).rejects.toThrow(
			"construction failure",
		);
		expect(testDoubles.captureFailure).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				kind: "lifecycle",
				attributes: expect.objectContaining({
					"error.type": "MCP_SERVER_BUILD_ERROR",
					"error.category": "McpServerBuildFailure",
				}),
				span: testDoubles.span,
			}),
		);
		expect(testDoubles.span.addEvent).toHaveBeenCalledWith(
			"mcp.lifecycle.failure",
			expect.objectContaining({
				"mcp.failure.phase": "build",
				"error.type": "MCP_SERVER_BUILD_ERROR",
				"error.category": "McpServerBuildFailure",
			}),
		);
	});

	it("continues after availability failures without logging arbitrary errors", async () => {
		const secret = "network-error-secret-sentinel";
		testDoubles.startupClient.getUserInfo.mockRejectedValueOnce(
			Object.assign(new Error(secret), { code: "ENOTFOUND" }),
		);

		await expect(createNodeMcpServer({ apiKey: "valid-key" })).resolves.toBe(
			testDoubles.server,
		);

		const stderr = JSON.stringify(vi.mocked(console.error).mock.calls);
		expect(stderr).toContain("Diagnostic: ENOTFOUND");
		expect(stderr).not.toContain(secret);
	});

	it.each([
		{ flag: "--help", output: "Usage:" },
		{ flag: "-h", output: "Usage:" },
	])("prints help for $flag without starting", async ({ flag, output }) => {
		process.argv.push(flag);

		await runStdioServer();
		expect(console.log).toHaveBeenCalledWith(expect.stringContaining(output));

		expect(console.log).toHaveBeenCalledWith(
			expect.stringContaining("HEVY_MCP_TELEMETRY=0"),
		);
		expect(console.log).toHaveBeenCalledWith(
			expect.stringContaining("Disable all project telemetry"),
		);
		expect(testDoubles.serverStartups.add).not.toHaveBeenCalled();
		expect(testDoubles.createHevyClient).not.toHaveBeenCalled();
	});

	it.each([
		["--help", "--transport", "http"],
		["--version", "--transport", "http"],
	])(
		"prioritizes %s over transport dispatch",
		async (flag, transportFlag, transport) => {
			process.argv.push(flag, transportFlag, transport);
			await runServer();
			expect(testDoubles.createHevyClient).not.toHaveBeenCalled();
		},
	);

	it.each(["--version", "-v"])(
		"prints the package version for %s without starting",
		async (flag) => {
			process.argv.push(flag);

			await runStdioServer();

			expect(console.error).toHaveBeenCalledWith("hevy-mcp v3.4.1");
			expect(testDoubles.serverStartups.add).not.toHaveBeenCalled();
			expect(testDoubles.createHevyClient).not.toHaveBeenCalled();
		},
	);

	it("validates the HTTP key once and builds sessions without re-probing", async () => {
		process.env.HEVY_API_KEY = "runtime-key";
		process.argv.push("--transport", "http");
		testDoubles.startStreamableHttpServer.mockImplementationOnce(
			async (
				_options: object,
				_apiKey: string,
				factory: (params: { apiKey: string }) => Promise<unknown>,
			) => {
				await factory({ apiKey: "runtime-key" });
				return testDoubles.httpHandle;
			},
		);

		await runServer();

		expect(testDoubles.startupClient.getUserInfo).toHaveBeenCalledOnce();
		expect(testDoubles.createHevyMcpServer).toHaveBeenCalledOnce();
		expect(testDoubles.installGracefulShutdown).toHaveBeenCalledWith(
			expect.objectContaining({ target: testDoubles.httpHandle }),
		);
	});

	it("fails HTTP startup when the key is rejected", async () => {
		process.env.HEVY_API_KEY = "invalid-key";
		process.argv.push("--transport", "http");
		testDoubles.startupClient.getUserInfo.mockRejectedValueOnce({
			isHevyHttpError: true,
			status: 401,
		});

		await expect(runServer()).rejects.toThrow(
			"HEVY_API_KEY is invalid or expired",
		);
		expect(testDoubles.startStreamableHttpServer).not.toHaveBeenCalled();
		expect(testDoubles.recordSessionTermination).toHaveBeenCalledWith(
			"startup_failure",
		);
		expect(testDoubles.captureFailure).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ expected: true }),
		);
	});

	it("connects stdio and installs lifecycle ownership", async () => {
		process.env.HEVY_API_KEY = "runtime-key";

		await runStdioServer();

		expect(testDoubles.serverStartups.add).toHaveBeenCalledWith(1, {
			version: "3.4.1",
		});
		expect(testDoubles.instrumentTransport).toHaveBeenCalledOnce();
		expect(testDoubles.server.connect).toHaveBeenCalledWith(
			testDoubles.transport,
		);
		expect(testDoubles.scheduleUpdateCheck).toHaveBeenCalledWith({
			packageName: "hevy-mcp",
			currentVersion: "3.4.1",
		});
		expect(testDoubles.installGracefulShutdown).toHaveBeenCalledWith(
			expect.objectContaining({
				target: testDoubles.server,
				onComplete: expect.any(Function),
			}),
		);
	});

	it("classifies a stdio connection failure", async () => {
		process.env.HEVY_API_KEY = "runtime-key";
		testDoubles.server.connect.mockRejectedValueOnce(
			new Error("connect failure"),
		);

		await expect(runStdioServer()).rejects.toThrow("connect failure");

		expect(testDoubles.recordSessionTermination).toHaveBeenCalledWith(
			"connect_failure",
		);
		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({
			code: SpanStatusCode.ERROR,
		});
		expect(testDoubles.installGracefulShutdown).not.toHaveBeenCalled();
	});

	it("reports graceful completion and flushes telemetry", async () => {
		process.env.HEVY_API_KEY = "runtime-key";
		await runStdioServer();
		const options = testDoubles.installGracefulShutdown.mock.calls[0]?.[0] as {
			onComplete: (succeeded: boolean) => Promise<void>;
		};

		await options.onComplete(true);

		expect(testDoubles.resolveTerminationCategory).toHaveBeenCalledWith(true);
		expect(testDoubles.recordSessionTermination).toHaveBeenCalledWith("clean");
		expect(testDoubles.flushTelemetry).toHaveBeenCalledOnce();
	});
});
