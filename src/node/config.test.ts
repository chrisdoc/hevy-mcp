import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.js";

function env(vars: Record<string, string | undefined>): NodeJS.ProcessEnv {
	return { ...process.env, ...vars } as NodeJS.ProcessEnv;
}

describe("parseConfig", () => {
	it("reads the API key from HEVY_API_KEY", () => {
		const cfg = parseConfig(env({ HEVY_API_KEY: "envOnly" }));
		expect(cfg.apiKey).toBe("envOnly");
	});

	it("returns empty apiKey when the environment variable is missing", () => {
		const cfg = parseConfig(env({ HEVY_API_KEY: undefined }));
		expect(cfg.apiKey).toBe("");
	});

	it("returns empty apiKey when env var is an empty string", () => {
		const cfg = parseConfig(env({ HEVY_API_KEY: "" }));
		expect(cfg.apiKey).toBe("");
	});
});
