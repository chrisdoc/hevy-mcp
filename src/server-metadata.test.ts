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
});
