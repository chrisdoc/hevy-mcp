import { describe, expect, it, vi } from "vitest";
import { assertIssuerUrl, parseConfig } from "./config.js";

function env(vars: Record<string, string | undefined>): NodeJS.ProcessEnv {
	return { ...process.env, ...vars } as NodeJS.ProcessEnv;
}

describe("parseConfig", () => {
	it("prefers --hevy-api-key= over env", () => {
		const cfg = parseConfig(
			["--hevy-api-key=cliKey"],
			env({ HEVY_API_KEY: "envKey" }),
		);
		expect(cfg.apiKey).toBe("cliKey");
	});

	it("supports --hevyApiKey= camelCase form", () => {
		const cfg = parseConfig(
			["--hevyApiKey=camelKey"],
			env({ HEVY_API_KEY: "envKey" }),
		);
		expect(cfg.apiKey).toBe("camelKey");
	});

	it("supports bare hevy-api-key= form", () => {
		const cfg = parseConfig(["hevy-api-key=bareKey"], env({}));
		expect(cfg.apiKey).toBe("bareKey");
	});

	it("falls back to env HEVY_API_KEY", () => {
		const cfg = parseConfig([], env({ HEVY_API_KEY: "envOnly" }));
		expect(cfg.apiKey).toBe("envOnly");
	});

	it("parses --transport=http", () => {
		const cfg = parseConfig(["--transport=http"], env({}));
		expect(cfg.transport).toBe("http");
	});

	it("parses --transport=stdio", () => {
		const cfg = parseConfig(["--transport=stdio"], env({}));
		expect(cfg.transport).toBe("stdio");
	});

	it("transport defaults to undefined when not provided", () => {
		const cfg = parseConfig([], env({}));
		expect(cfg.transport).toBeUndefined();
	});

	it("parses --port=4000", () => {
		const cfg = parseConfig(["--port=4000"], env({}));
		expect(cfg.port).toBe(4000);
	});

	it("port defaults to undefined when not provided", () => {
		const cfg = parseConfig([], env({}));
		expect(cfg.port).toBeUndefined();
	});

	it("throws on out-of-range port", () => {
		expect(() => parseConfig(["--port=99999"], env({}))).toThrow(
			/Invalid --port value/,
		);
	});

	it("parses --transport=http+oauth", () => {
		const cfg = parseConfig(["--transport=http+oauth"], env({}));
		expect(cfg.transport).toBe("http+oauth");
	});

	it("parses --issuer-url=https://example.com", () => {
		const cfg = parseConfig(["--issuer-url=https://example.com"], env({}));
		expect(cfg.issuerUrl).toBe("https://example.com");
	});

	it("falls back to MCP_ISSUER_URL env var", () => {
		const cfg = parseConfig(
			[],
			env({ MCP_ISSUER_URL: "https://env.example.com" }),
		);
		expect(cfg.issuerUrl).toBe("https://env.example.com");
	});

	it("CLI --issuer-url takes priority over MCP_ISSUER_URL env var", () => {
		const cfg = parseConfig(
			["--issuer-url=https://cli.example.com"],
			env({ MCP_ISSUER_URL: "https://env.example.com" }),
		);
		expect(cfg.issuerUrl).toBe("https://cli.example.com");
	});
});

describe("assertIssuerUrl", () => {
	it("exits if issuer URL is undefined", () => {
		const exitSpy = vi
			.spyOn(process, "exit")
			.mockImplementation((_code?: string | number | null) => {
				throw new Error("process.exit called");
			});
		expect(() => assertIssuerUrl(undefined)).toThrow("process.exit called");
		exitSpy.mockRestore();
	});

	it("does not throw when issuer URL is provided", () => {
		expect(() => assertIssuerUrl("https://example.com")).not.toThrow();
	});
});
