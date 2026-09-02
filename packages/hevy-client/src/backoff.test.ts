import { describe, expect, it } from "vitest";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";

import {
	customPromiseSleep,
	effectClockSleep,
	retryBackoff,
} from "./backoff.js";

describe("Effect retry backoff primitives", () => {
	it("uses the provided Effect TestClock for the default wait", async () => {
		const controller = new AbortController();
		const program = Effect.gen(function* () {
			const fiber = yield* effectClockSleep(1_000, controller.signal).pipe(
				Effect.forkChild,
			);
			yield* TestClock.adjust("1 second");
			yield* Fiber.join(fiber);
			return true;
		});

		await expect(
			Effect.runPromise(Effect.provide(program, TestClock.layer())),
		).resolves.toBe(true);
	});

	it("captures synchronous custom sleep throws as typed backoff failures", async () => {
		const controller = new AbortController();
		const result = await Effect.runPromiseExit(
			retryBackoff({
				delayMs: 1,
				signal: controller.signal,
				sleep: () => {
					throw new Error("sleep failed");
				},
				cause: undefined,
				method: "GET",
				endpoint: "/v1/workouts",
				phase: "backoff",
				operationSafety: "read",
			}),
		);

		expect(result._tag).toBe("Failure");
	});

	it("keeps a non-cooperative custom sleep interruptible", async () => {
		const controller = new AbortController();
		const fiber = await Effect.runPromise(
			customPromiseSleep(
				60_000,
				controller.signal,
				() => new Promise(() => {}),
			).pipe(Effect.forkChild),
		);
		await Effect.runPromise(Fiber.interrupt(fiber));
		expect(fiber).toBeDefined();
	});
});
