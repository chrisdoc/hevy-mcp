import { afterEach, describe, expect, it, vi } from "vitest";

const testDoubles = vi.hoisted(() => ({
	createHevyClient: vi.fn(() => ({ kind: "client" })),
	createHevyMcpServer: vi.fn(
		(options: {
			createClient: (context: { onLog: () => void }) => unknown;
		}) => {
			options.createClient({ onLog: vi.fn() });
			return { kind: "server" };
		},
	),
}));

vi.mock("@hevy-mcp/hevy-client", () => ({
	createHevyClient: testDoubles.createHevyClient,
}));
vi.mock("@hevy-mcp/core", () => ({
	createHevyMcpServer: testDoubles.createHevyMcpServer,
}));

// If the embedding entry ever eagerly imports the runtime bootstrap, this
// mock factory is evaluated and the test fails before any test can run.
vi.mock("./utils/telemetry.js", () => {
	throw new Error("embedding entry imported runtime telemetry");
});

import { createNodeMcpServer } from "./index.js";

describe("Node embedding entry", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		testDoubles.createHevyClient.mockClear();
		testDoubles.createHevyMcpServer.mockClear();
	});

	it("imports and constructs without startup side effects", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
		const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
		const argv = [...process.argv];
		process.argv = ["node", "embedding-test", "--transport", "http"];
		process.env.HEVY_API_KEY = "environment-sentinel";

		await expect(
			createNodeMcpServer({ apiKey: "programmatic-key" }),
		).resolves.toEqual({ kind: "server" });

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(setTimeoutSpy).not.toHaveBeenCalled();
		expect(setIntervalSpy).not.toHaveBeenCalled();
		expect(testDoubles.createHevyClient).toHaveBeenCalledWith({
			apiKey: "programmatic-key",
			onLog: expect.any(Function),
		});
		expect(testDoubles.createHevyMcpServer).toHaveBeenCalledOnce();

		process.argv = argv;
		delete process.env.HEVY_API_KEY;
	});

	it("validates the supplied key locally", async () => {
		await expect(createNodeMcpServer({ apiKey: "" })).rejects.toThrow(
			"Hevy API key is required",
		);
		expect(testDoubles.createHevyClient).not.toHaveBeenCalled();
		expect(testDoubles.createHevyMcpServer).not.toHaveBeenCalled();
	});

	it("forwards the embedding lifecycle signal without connecting", async () => {
		const lifecycleSignal = new AbortController().signal;

		await createNodeMcpServer(
			{ apiKey: "programmatic-key" },
			"stdio",
			lifecycleSignal,
		);

		expect(testDoubles.createHevyMcpServer).toHaveBeenCalledWith(
			expect.objectContaining({ lifecycleSignal }),
		);
	});
});
