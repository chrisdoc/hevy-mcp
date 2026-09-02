import { afterEach, describe, expect, it } from "vitest";

import { fetch, getConfig, mergeConfig, setConfig } from "./fetch.js";
import type { RequestConfig } from "./fetch.js";

describe("mergeConfig", () => {
	afterEach(() => {
		setConfig({});
	});

	it("returns a new config object and does not mutate its base argument", () => {
		const base: RequestConfig = { baseURL: "https://api.hevyapp.com" };
		const next: Partial<RequestConfig> = { headers: { "x-trace": "abc" } };

		const merged = mergeConfig<RequestConfig>(base, next);

		expect(merged).not.toBe(base);
		expect(merged.baseURL).toBe("https://api.hevyapp.com");
		expect(merged.headers).toEqual({ "x-trace": "abc" });
		expect(base.headers).toBeUndefined();
	});

	it("returns a value equal to base when next is empty", () => {
		const base = {
			baseURL: "https://api.hevyapp.com",
			headers: { accept: "application/json" },
		};

		const merged = mergeConfig(base, {});

		expect(merged).toEqual(base);
		expect(merged).not.toBe(base);
	});
});

describe("setConfig and getConfig", () => {
	it("stores the partial config and returns it", () => {
		setConfig({ baseURL: "https://staging.hevyapp.com" });

		expect(getConfig()).toEqual({ baseURL: "https://staging.hevyapp.com" });
	});

	it("merges a later setConfig over the earlier one", () => {
		setConfig({ baseURL: "https://staging.hevyapp.com" });
		setConfig({ headers: { "x-trace": "second" } });

		const config = getConfig();

		expect(config.baseURL).toBeUndefined();
		expect(config.headers).toEqual({ "x-trace": "second" });
	});
});

describe("fetch", () => {
	it("is exported as an async function", async () => {
		const source = await import("./fetch.js");
		expect(source.fetch).toBe(fetch);
	});
});
