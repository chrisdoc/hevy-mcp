import { describe, expect, it } from "vitest";

import {
	SAFE_USER_HASH_PATTERN,
	TELEMETRY_ARGUMENT_KEYS,
	USER_HASH_CONTEXT,
	USER_HASH_LENGTH,
} from "./telemetry-contract.js";

describe("telemetry contract", () => {
	it("keeps the hash pattern and length in agreement", () => {
		const sample = "a".repeat(USER_HASH_LENGTH);
		expect(SAFE_USER_HASH_PATTERN.test(sample)).toBe(true);
		expect(SAFE_USER_HASH_PATTERN.test("a".repeat(USER_HASH_LENGTH + 1))).toBe(
			false,
		);
		expect(SAFE_USER_HASH_PATTERN.test("g".repeat(USER_HASH_LENGTH))).toBe(
			false,
		);
	});

	it("lists unique snake_case argument keys", () => {
		expect(new Set(TELEMETRY_ARGUMENT_KEYS).size).toBe(
			TELEMETRY_ARGUMENT_KEYS.length,
		);
		for (const key of TELEMETRY_ARGUMENT_KEYS) {
			expect(key).toMatch(/^[a-z_]+$/);
		}
	});

	it("pins the user hash context string", () => {
		expect(USER_HASH_CONTEXT).toBe("hevy-mcp:sentry-user-id:v1");
	});
});
