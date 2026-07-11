import { describe, expect, it, vi } from "vitest";
import { FIXTURE_RESULT_PREFIX } from "../performance/fixture-result.js";
import {
	callPerformanceTool,
	createPerformanceHarness,
	measuredDuration,
	observeServerRss,
	parseProcStatusRss,
} from "../performance/harness.js";

const harnessMocks = vi.hoisted(() => {
	const dataListeners: Array<(chunk: string) => void> = [];
	const client = {
		close: vi.fn(),
		connect: vi.fn(),
		request: vi.fn(),
	};
	const transport = {
		pid: 12_345,
		stderr: {
			on: vi.fn((event: string, listener: (chunk: string) => void) => {
				if (event === "data") dataListeners.push(listener);
			}),
			setEncoding: vi.fn(),
		},
	};
	return {
		Client: vi.fn(function Client() {
			return client;
		}),
		StdioClientTransport: vi.fn(function StdioClientTransport() {
			return transport;
		}),
		client,
		dataListeners,
		transport,
	};
});

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
	Client: harnessMocks.Client,
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
	StdioClientTransport: harnessMocks.StdioClientTransport,
}));

function fixtureMarker() {
	return `${FIXTURE_RESULT_PREFIX}${JSON.stringify({
		version: 1,
		mode: "startup",
		expectedRequestCount: 1,
		observedRequestCount: 1,
		startupRequestCount: 1,
		scenarioRequestCount: 0,
		pendingMocks: [],
		unexpectedRequests: [],
		blockedFetchRequests: [],
		setupFailure: null,
		cleanupFailure: null,
		verified: true,
	})}\n`;
}

function emitFixtureMarker() {
	for (const listener of harnessMocks.dataListeners) listener(fixtureMarker());
}

function emitSplitFixtureMarker() {
	const marker = fixtureMarker();
	const splitAt = FIXTURE_RESULT_PREFIX.length - 3;
	for (const listener of harnessMocks.dataListeners) {
		listener(marker.slice(0, splitAt));
		listener(marker.slice(splitAt));
	}
}

function resetHarnessMocks() {
	harnessMocks.dataListeners.splice(0);
	harnessMocks.Client.mockClear();
	harnessMocks.StdioClientTransport.mockClear();
	harnessMocks.client.close.mockReset().mockResolvedValue(undefined);
	harnessMocks.client.connect.mockReset().mockResolvedValue(undefined);
	harnessMocks.client.request.mockReset();
	harnessMocks.transport.stderr.on.mockClear();
	harnessMocks.transport.stderr.setEncoding.mockClear();
}

describe("server RSS observations", () => {
	it("parses Linux VmRSS values as bytes", () => {
		expect(parseProcStatusRss("Name:\tnode\nVmRSS:\t  1234 kB\n")).toBe(
			1_263_616,
		);
	});

	it("returns null when VmRSS is absent or malformed", () => {
		expect(parseProcStatusRss("Name:\tnode\n")).toBeNull();
		expect(parseProcStatusRss("VmRSS: unknown kB\n")).toBeNull();
	});

	it("uses a nullable fallback when the process cannot be observed", () => {
		const observation = observeServerRss(null, 3, "initialized");
		expect(observation).toMatchObject({
			iteration: 3,
			phase: "initialized",
			rssBytes: null,
		});
		expect(observation.unavailableReason).toBeTruthy();
	});

	it("reads the current process and handles inaccessible process status files", () => {
		expect(
			observeServerRss(process.pid, 1, "scenario-complete").rssBytes,
		).toBeTypeOf("number");
		expect(observeServerRss(-1, 2, "initialized")).toMatchObject({
			rssBytes: null,
			unavailableReason: expect.any(String),
		});
	});

	it("rejects VmRSS values outside JavaScript's safe integer range", () => {
		expect(parseProcStatusRss("VmRSS:\t  9007199254740992 kB\n")).toBeNull();
	});
});

describe("performance harness helpers", () => {
	it("creates and closes a fixture-backed client harness", async () => {
		resetHarnessMocks();
		harnessMocks.client.connect.mockImplementation(async () => {
			emitFixtureMarker();
		});

		const harness = await createPerformanceHarness("startup");

		expect(harness.pid).toBe(12_345);
		expect(harnessMocks.StdioClientTransport).toHaveBeenCalledWith(
			expect.objectContaining({
				command: process.execPath,
				env: expect.objectContaining({
					HEVY_API_KEY: "performance-fixture-api-key",
					HEVY_PERFORMANCE_FIXTURE_MODE: "startup",
				}),
			}),
		);
		expect(await harness.close()).toMatchObject({
			mode: "startup",
			verified: true,
		});
		await expect(harness.close()).rejects.toThrow("closed more than once");
	});

	it("detects a fixture marker split across stderr chunks", async () => {
		resetHarnessMocks();
		harnessMocks.client.connect.mockImplementation(async () => {
			emitSplitFixtureMarker();
		});

		const harness = await createPerformanceHarness("startup");

		await expect(harness.close()).resolves.toMatchObject({
			mode: "startup",
			verified: true,
		});
	});

	it("includes fixture diagnostics when client initialization fails", async () => {
		resetHarnessMocks();
		harnessMocks.client.connect.mockImplementation(async () => {
			emitFixtureMarker();
			throw new Error("connection refused");
		});

		await expect(createPerformanceHarness("startup")).rejects.toThrow(
			"failed to initialize built CLI",
		);
		expect(harnessMocks.client.close).toHaveBeenCalledOnce();
	});

	it("normalizes successful and invalid tool responses", async () => {
		resetHarnessMocks();
		harnessMocks.client.request.mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			structuredContent: { count: 1 },
		});
		const harness = await createPerformanceHarness("startup");
		await expect(
			callPerformanceTool(harness.client, "get-workout-count", {}),
		).resolves.toEqual({
			text: "ok",
			structuredContent: { count: 1 },
		});

		harnessMocks.client.request.mockResolvedValue({ content: [] });
		await expect(
			callPerformanceTool(harness.client, "get-workout-count", {}),
		).rejects.toThrow("did not return text content");
		harnessMocks.client.request.mockResolvedValue({
			content: [{ type: "text", text: "nope" }],
			isError: true,
		});
		await expect(
			callPerformanceTool(harness.client, "get-workout-count", {}),
		).rejects.toThrow("returned an MCP error: nope");
	});

	it("keeps measured durations positive", () => {
		expect(measuredDuration(performance.now() + 1_000)).toBe(Number.EPSILON);
	});
});
