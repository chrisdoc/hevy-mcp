import { describe, expect, it } from "vitest";
import { createNodeUserHash } from "./user-hash.js";

describe("Node telemetry user hash", () => {
	it("matches the Worker HMAC pseudonym contract", () => {
		expect(createNodeUserHash("test-key")).toBe("2cb0b5f95a");
		expect(createNodeUserHash("another-key")).toBe("0ddf86a356");
	});

	it("returns no identity for an empty credential", () => {
		expect(createNodeUserHash("")).toBeUndefined();
	});

	it("returns only a bounded lowercase pseudonym", () => {
		const secret = "node-api-key-secret-sentinel";
		const hash = createNodeUserHash(secret);

		expect(hash).toMatch(/^[0-9a-f]{10}$/u);
		expect(hash).not.toContain(secret);
	});
});
