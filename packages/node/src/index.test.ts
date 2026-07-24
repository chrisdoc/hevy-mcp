import { SpanStatusCode } from "@opentelemetry/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testDoubles = vi.hoisted(() => {
	const span = {
		setAttribute: vi.fn(),
		setStatus: vi.fn(),
		end: vi.fn(),
	};
	const server = {
		connect: vi.fn().mockResolvedValue(undefined),
		close: vi.fn().mockResolvedValue(undefined),
	};
	const startupClient = {
		getUserInfo: vi.fn().mockResolvedValue({ id: "user" }),
	};
	const runtimeClient = { kind: "runtime-client" };

	return {
		span,
		server,
		startupClient,
		runtimeClient,
		transport: { kind: "stdio-transport" },
		createHevyClient: vi.fn(),
		createHevyMcpServer: vi.fn(),
		wrapMcpServerWithSentry: vi.fn((value: unknown) => value),
		setSentryUser: vi.fn(),
		setCurrentUserHash: vi.fn(),
		flushTelemetry: vi.fn().mockResolvedValue(undefined),
		serverStartups: { add: vi.fn() },
		installGracefulShutdown: vi.fn(),
		instrumentTransport: vi.fn(() => ({ kind: "stdio-transport" })),
		scheduleUpdateCheck: vi.fn(),
		recordSessionTermination: vi.fn(),
		resolveTerminationCategory: vi.fn(() => "clean"),
		createNodeHevyClientOptions: vi.fn(() => ({
			onRequestComplete: vi.fn(),
		})),
		createNodeToolObserver: vi.fn(() => ({ kind: "observer" })),
	};
});

vi.mock("./utils/telemetry.js", () => ({
	Sentry: {
		setUser: testDoubles.setSentryUser,
		wrapMcpServerWithSentry: testDoubles.wrapMcpServerWithSentry,
	},
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
	setCurrentUserHash: testDoubles.setCurrentUserHash,
}));

vi.mock("./utils/metrics.js", () => ({
	serverStartups: testDoubles.serverStartups,
}));

vi.mock("@hevy-mcp/hevy-client", () => ({
	createHevyClient: testDoubles.createHevyClient,
	isHevyHttpError: (error: unknown) =>
		Boolean(
			error &&
			typeof error === "object" &&
			"isHevyHttpError" in error &&
			error.isHevyHttpError === true,
		),
}));

vi.mock("@hevy-mcp/core", () => ({
	createHevyMcpServer: testDoubles.createHevyMcpServer,
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
	StdioServerTransport: class StdioServerTransport {},
}));

vi.mock("./utils/graceful-shutdown.js", () => ({
	installGracefulShutdown: testDoubles.installGracefulShutdown,
}));

vi.mock("./utils/hevy-client-observability.js", () => ({
	createNodeHevyClientOptions: testDoubles.createNodeHevyClientOptions,
}));

vi.mock("./utils/tool-observer.js", () => ({
	createNodeToolObserver: testDoubles.createNodeToolObserver,
}));

vi.mock("./utils/stdio-observability.js", () => ({
	createInstrumentedStdioTransport: testDoubles.instrumentTransport,
}));

vi.mock("./utils/mcp-session-observability.js", () => ({
	recordMcpSessionTermination: testDoubles.recordSessionTermination,
	resolveSessionTerminationCategory: testDoubles.resolveTerminationCategory,
}));

vi.mock("./utils/version-check.js", () => ({
	scheduleUpdateCheck: testDoubles.scheduleUpdateCheck,
}));

import { createNodeMcpServer, runStdioServer } from "./index.js";

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
		testDoubles.server.connect.mockResolvedValue(undefined);
		testDoubles.startupClient.getUserInfo.mockResolvedValue({ id: "user" });
		configureSuccessfulConstruction();
		process.argv = [originalArgv[0] ?? "node", "hevy-mcp"];
		delete process.env.HEVY_API_KEY;
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
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
		expect(testDoubles.wrapMcpServerWithSentry).toHaveBeenCalledWith(
			testDoubles.server,
			{ recordInputs: false, recordOutputs: false },
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"mcp.tools.count",
			25,
		);
		expect(testDoubles.server.connect).not.toHaveBeenCalled();
	});

	it("rejects empty programmatic options before making a request", async () => {
		await expect(createNodeMcpServer({ apiKey: "" })).rejects.toThrow(
			"Hevy API key is required",
		);
		expect(testDoubles.createHevyClient).not.toHaveBeenCalled();
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
		expect(testDoubles.serverStartups.add).not.toHaveBeenCalled();
		expect(testDoubles.createHevyClient).not.toHaveBeenCalled();
	});

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
