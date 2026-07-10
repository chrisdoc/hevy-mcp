import { afterEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "./config.js";

function env(vars: Record<string, string | undefined>): NodeJS.ProcessEnv {
	return { ...process.env, ...vars } as NodeJS.ProcessEnv;
}

describe("parseConfig", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		["--hevy-api-key=cliKey", "cliKey"],
		["--hevyApiKey=camelKey", "camelKey"],
		["hevy-api-key=bareKey", "bareKey"],
	])("uses %s and emits a deprecation warning", (cliArg, expectedApiKey) => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const cfg = parseConfig([cliArg], env({ HEVY_API_KEY: "envKey" }));

		expect(cfg.apiKey).toBe(expectedApiKey);
		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining("HEVY_API_KEY"),
		);
		expect(errorSpy.mock.calls[0]?.[0]).toMatch(/deprecated/i);
	});

	it("falls back to env HEVY_API_KEY without deprecation warning", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const cfg = parseConfig([], env({ HEVY_API_KEY: "envOnly" }));

		expect(cfg.apiKey).toBe("envOnly");
		expect(cfg.autoConfirm).toBe(false);
		expect(errorSpy).not.toHaveBeenCalled();
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

	it("enables auto-confirm for the exact --yes argument", () => {
		expect(parseConfig(["--yes"], env({})).autoConfirm).toBe(true);
		expect(parseConfig(["--YES"], env({})).autoConfirm).toBe(false);
		expect(parseConfig(["--yes=true"], env({})).autoConfirm).toBe(false);
	});

	it("enables auto-confirm only for exact environment value 1", () => {
		expect(
			parseConfig([], env({ HEVY_MCP_AUTO_CONFIRM: "1" })).autoConfirm,
		).toBe(true);
		for (const value of ["true", "yes", "0", "", "01"]) {
			expect(
				parseConfig([], env({ HEVY_MCP_AUTO_CONFIRM: value })).autoConfirm,
			).toBe(false);
		}
	});
});
