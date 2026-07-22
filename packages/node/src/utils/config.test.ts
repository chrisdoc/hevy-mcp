import { describe, expect, it } from "vitest";
import { MissingHevyApiKeyError, assertApiKey, parseConfig } from "./config.js";

describe("Node startup configuration", () => {
	it("reads only the environment passed to the parser", () => {
		expect(parseConfig({ HEVY_API_KEY: "from-env" }).apiKey).toBe("from-env");
	});

	it("raises a typed error instead of terminating the process", () => {
		expect(() => assertApiKey("")).toThrow(MissingHevyApiKeyError);
	});
});
