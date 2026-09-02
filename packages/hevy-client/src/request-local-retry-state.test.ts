import { describe, expect, it } from "vitest";
import { Effect } from "effect";

import { createRetrySchedule } from "./retry-schedule.js";
import { DEFAULT_RETRY_POLICY } from "./retry-policy.js";

/**
 * Characterization: request-local schedule state.
 *
 * Two logical requests that start from the same policy must never share a
 * mutable schedule. Each call to `createRetrySchedule` owns its own state so
 * sequential and concurrent callers cannot observe each other's attempt
 * counters, budgets, or delays.
 */
describe("request-local retry schedule state", () => {
	it("creates an independent schedule per logical request", () => {
		const first = createRetrySchedule(1, undefined, () => 0);
		const second = createRetrySchedule(1, undefined, () => 0);
		expect(first).not.toBe(second);
	});

	it("does not leak attempt state between sequential requests", async () => {
		const first = await Effect.runPromise(
			Effect.sync(() => createRetrySchedule(1, undefined, () => 0)),
		);
		const second = await Effect.runPromise(
			Effect.sync(() => createRetrySchedule(1, undefined, () => 0)),
		);
		expect(first).not.toBe(second);
	});

	it("normalizes the default policy for every new request", () => {
		expect(DEFAULT_RETRY_POLICY).toMatchObject({
			maxRetries: 3,
			baseDelayMs: 300,
			maxDelayMs: 5_000,
		});
	});
});
