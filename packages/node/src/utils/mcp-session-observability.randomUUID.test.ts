import { describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:crypto")>()),
	randomUUID: undefined,
}));

const { createMcpSessionContext } =
	await import("./mcp-session-observability.js");

describe("MCP session telemetry ID fallback", () => {
	it("creates an ID when node:crypto.randomUUID is unavailable", () => {
		const context = createMcpSessionContext({ method: "initialize" });

		expect(context.telemetrySessionId).toMatch(/^[a-z0-9]+-[a-z0-9]+$/u);
	});
});
