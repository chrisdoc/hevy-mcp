import { describe, expect, it } from "vitest";
import { parseWorkerHttpUrl } from "../support/worker-http-live-config.js";

describe("parseWorkerHttpUrl", () => {
	it("leaves the local mode unset when the variable is absent", () => {
		expect(parseWorkerHttpUrl(undefined)).toBeUndefined();
	});

	it("accepts the canonical hosted Worker endpoint", () => {
		expect(parseWorkerHttpUrl("https://hevy.chrisdoc.dev/mcp")?.href).toBe(
			"https://hevy.chrisdoc.dev/mcp",
		);
	});

	it("accepts another HTTPS endpoint with the exact MCP path", () => {
		expect(
			parseWorkerHttpUrl("https://preview.example.test/mcp")?.pathname,
		).toBe("/mcp");
	});

	it("rejects non-HTTPS, wrong-path, credentialed, and decorated URLs", () => {
		for (const value of [
			"",
			"http://preview.example.test/mcp",
			"https://preview.example.test/",
			"https://preview.example.test/mcp/",
			"https://@preview.example.test/mcp",
			"https://user:secret@preview.example.test/mcp",
			"https://preview.example.test/mcp?debug=1",
			"https://preview.example.test/mcp#fragment",
			"not a URL",
		]) {
			expect(() => parseWorkerHttpUrl(value)).toThrow("HEVY_WORKER_HTTP_URL");
		}
	});

	it("rejects whitespace around an otherwise valid URL", () => {
		expect(() =>
			parseWorkerHttpUrl(" https://preview.example.test/mcp "),
		).toThrow("HEVY_WORKER_HTTP_URL");
	});
});
