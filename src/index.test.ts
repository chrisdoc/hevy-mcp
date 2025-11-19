import { describe, expect, it } from "vitest";
import createServer, { configSchema } from "./index.js";

describe("Smithery exports", () => {
	it("validates HEVY_API_KEY via configSchema", () => {
		expect(() => configSchema.parse({ apiKey: "" })).toThrow();
		const parsed = configSchema.parse({ apiKey: "abc" });
		expect(parsed.apiKey).toBe("abc");
	});

	it("creates an MCP server instance", () => {
		const server = createServer({ config: { apiKey: "test-key" } });
		expect(server).toBeDefined();
	});
});
