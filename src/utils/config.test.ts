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
		expect(errorSpy).not.toHaveBeenCalled();
	});
});
