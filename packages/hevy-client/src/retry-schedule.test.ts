import { Duration, Effect, Fiber, Schedule } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vitest";

import { createRetrySchedule } from "./retry-schedule.js";

describe("createRetrySchedule", () => {
	it("uses the pure retry policy for each scheduled failure", async () => {
		const schedule = createRetrySchedule(2, undefined, () => 0);
		const step = await Effect.runPromise(Schedule.toStep(schedule));
		const error = {
			status: 503,
			headers: new Headers(),
		};

		const first = await Effect.runPromise(step(0, error));
		const second = await Effect.runPromise(step(0, error));

		expect(first[1]).toEqual(Duration.millis(300));
		expect(second[1]).toEqual(Duration.millis(600));
	});

	it("stops after the configured number of retries", async () => {
		const schedule = createRetrySchedule(1, undefined, () => 0);
		const step = await Effect.runPromise(Schedule.toStep(schedule));
		const error = { status: 503, headers: new Headers() };

		await Effect.runPromise(step(0, error));
		const stopped = await Effect.runPromiseExit(step(0, error));

		expect(stopped).toMatchObject({ _tag: "Failure" });
	});

	it("advances retry waits deterministically with TestClock", async () => {
		let attempts = 0;
		const error = { status: 503, headers: new Headers() };
		const task = Effect.gen(function* () {
			attempts += 1;
			if (attempts === 1) yield* Effect.fail(error);
			return "ok";
		});
		const program = Effect.gen(function* () {
			const fiber = yield* Effect.retry(
				task,
				createRetrySchedule(1, undefined, () => 0),
			).pipe(Effect.forkChild);
			yield* TestClock.adjust("300 millis");
			return yield* Fiber.join(fiber);
		});

		await expect(
			Effect.runPromise(Effect.provide(program, TestClock.layer())),
		).resolves.toBe("ok");
		expect(attempts).toBe(2);
	});
});
