import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.js";

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
});
