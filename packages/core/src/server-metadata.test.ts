import { afterEach, describe, expect, it, vi } from "vitest";

describe.sequential("server metadata", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	it("falls back to development metadata without build globals", async () => {
		vi.unstubAllGlobals();
		vi.resetModules();
		const metadata = await import("./server-metadata.js");

		expect(metadata.SERVER_NAME).toBe("hevy-mcp");
		expect(metadata.SERVER_VERSION).toBe("dev");
	});

	it("uses metadata injected by the build", async () => {
		vi.stubGlobal("__HEVY_MCP_NAME__", "fixture-server");
		vi.stubGlobal("__HEVY_MCP_VERSION__", "1.2.3-fixture");
		vi.resetModules();
		const metadata = await import("./server-metadata.js");

		expect(metadata.SERVER_NAME).toBe("fixture-server");
		expect(metadata.SERVER_VERSION).toBe("1.2.3-fixture");
	});

	it("teaches clients to use canonical tool names and argument objects", async () => {
		const metadata = await import("./server-metadata.js");

		expect(metadata.SERVER_INSTRUCTIONS).toContain(
			'call get-workout with {"workout_id": "<id>"}',
		);
		expect(metadata.SERVER_INSTRUCTIONS).toContain(
			"not get-workout-workoutId=<id>",
		);
		expect(metadata.SERVER_INSTRUCTIONS).toContain(
			"get-user-info is not an MCP tool; use the hevy://user resource",
		);
	});
});
