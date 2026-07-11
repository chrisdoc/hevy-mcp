import { describe, expect, it } from "vitest";
import { resolveApiBaseUrl } from "./test-api-base-url.js";

const PRODUCTION_URL = "https://api.hevyapp.com";

describe("resolveApiBaseUrl", () => {
	it("uses the production API URL by default", () => {
		expect(resolveApiBaseUrl({})).toBe(PRODUCTION_URL);
	});

	it("ignores the test URL outside NODE_ENV=test", () => {
		expect(
			resolveApiBaseUrl({
				NODE_ENV: "production",
				HEVY_MCP_TEST_API_BASE_URL: "http://127.0.0.1:4321",
			}),
		).toBe(PRODUCTION_URL);
	});

	it.each([
		"http://127.0.0.1:4321",
		"http://127.0.0.1:4321/",
		"http://[::1]:4321",
	])("accepts test-only numeric loopback URL %s", (url) => {
		expect(
			resolveApiBaseUrl({
				NODE_ENV: "test",
				HEVY_MCP_TEST_API_BASE_URL: url,
			}),
		).toBe(new URL(url).origin);
	});

	it.each([
		["malformed", "not-a-url"],
		["HTTPS", "https://127.0.0.1:4321"],
		["localhost name", "http://localhost:4321"],
		["non-loopback IPv4", "http://192.0.2.1:4321"],
		["non-loopback IPv6", "http://[::2]:4321"],
		["missing port", "http://127.0.0.1"],
		["non-root path", "http://127.0.0.1:4321/v1"],
		["username", "http://user@127.0.0.1:4321"],
		["password", "http://user:pass@127.0.0.1:4321"],
		["query", "http://127.0.0.1:4321/?test=1"],
		["fragment", "http://127.0.0.1:4321/#test"],
	])("rejects %s rather than falling back", (_label, url) => {
		expect(() =>
			resolveApiBaseUrl({
				NODE_ENV: "test",
				HEVY_MCP_TEST_API_BASE_URL: url,
			}),
		).toThrow(/HEVY_MCP_TEST_API_BASE_URL is invalid/);
	});
});
