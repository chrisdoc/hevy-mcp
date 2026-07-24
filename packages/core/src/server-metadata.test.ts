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

	it("guides clients through discovery-first reads and confirmed writes", async () => {
		const { SERVER_INSTRUCTIONS } = await import("./server-metadata.js");

		expect(SERVER_INSTRUCTIONS).toMatch(
			/get-training-summary[\s\S]*never guess IDs[\s\S]*search-exercise-templates[\s\S]*get-exercise-templates/,
		);
		expect(SERVER_INSTRUCTIONS).toMatch(
			/get the current routine or workout[\s\S]*replace the full object[\s\S]*explicit approval/,
		);
		expect(SERVER_INSTRUCTIONS).toMatch(
			/never invent completion data[\s\S]*do not retry automatically/,
		);
	});

	it("retains pagination and rate-limit safeguards", async () => {
		const { SERVER_INSTRUCTIONS } = await import("./server-metadata.js");

		expect(SERVER_INSTRUCTIONS).toContain("start at page 1");
		expect(SERVER_INSTRUCTIONS).toContain("pageSize up to 10");
		expect(SERVER_INSTRUCTIONS).toContain("HTTP 429");
	});
});
