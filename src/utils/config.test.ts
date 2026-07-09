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

	it("returns empty apiKey when CLI flag and env var are missing", () => {
		const cfg = parseConfig([], env({ HEVY_API_KEY: undefined }));
		expect(cfg.apiKey).toBe("");
	});

	it("returns empty apiKey when env var is an empty string", () => {
		const cfg = parseConfig([], env({ HEVY_API_KEY: "" }));
		expect(cfg.apiKey).toBe("");
	});

	it("ignores empty CLI API key values and falls back to env", () => {
		const cfg = parseConfig(
			["--hevy-api-key="],
			env({ HEVY_API_KEY: "envFallback" }),
		);
		expect(cfg.apiKey).toBe("envFallback");
	});
});
