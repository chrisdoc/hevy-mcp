import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.js";

function env(vars: Record<string, string | undefined>): NodeJS.ProcessEnv {
	return { ...process.env, ...vars } as NodeJS.ProcessEnv;
}

describe("parseConfig", () => {
	it("reads the API key from HEVY_API_KEY", () => {
		const cfg = parseConfig([], env({ HEVY_API_KEY: "envOnly" }));
		expect(cfg.apiKey).toBe("envOnly");
		expect(cfg.confirmMutations).toBe(false);
	});

	it("returns empty apiKey when the environment variable is missing", () => {
		const cfg = parseConfig([], env({ HEVY_API_KEY: undefined }));
		expect(cfg.apiKey).toBe("");
	});

	it("returns empty apiKey when env var is an empty string", () => {
		const cfg = parseConfig([], env({ HEVY_API_KEY: "" }));
		expect(cfg.apiKey).toBe("");
	});

	it("enables mutation confirmation for the exact CLI flag", () => {
		expect(parseConfig(["--confirm-mutations"], env({})).confirmMutations).toBe(
			true,
		);
		expect(parseConfig(["--CONFIRM-MUTATIONS"], env({})).confirmMutations).toBe(
			false,
		);
		expect(
			parseConfig(["--confirm-mutations=true"], env({})).confirmMutations,
		).toBe(false);
	});

	it("enables mutation confirmation only for exact environment value 1", () => {
		expect(
			parseConfig([], env({ HEVY_MCP_CONFIRM_MUTATIONS: "1" }))
				.confirmMutations,
		).toBe(true);
		for (const value of ["true", "yes", "0", "", "01"]) {
			expect(
				parseConfig([], env({ HEVY_MCP_CONFIRM_MUTATIONS: value }))
					.confirmMutations,
			).toBe(false);
		}
	});
});
