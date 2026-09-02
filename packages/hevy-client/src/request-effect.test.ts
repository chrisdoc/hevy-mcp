import { describe, expect, it, vi } from "vitest";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";

import { createNativeClient } from "./hevy-client-kubb.js";

describe("internal production request Effect seam", () => {
	it("routes default client backoff through TestClock", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("{}", { status: 503 }))
			.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
		const client = createNativeClient("test-key", "https://api.hevyapp.com", {
			fetch: fetchMock,
			maxGetRetries: 1,
		});

		const program = Effect.gen(function* () {
			const fiber = yield* client
				.requestEffect({ method: "GET", url: "/v1/user/info" })
				.pipe(Effect.forkChild);
			yield* Effect.yieldNow;
			expect(fetchMock).toHaveBeenCalledOnce();
			yield* TestClock.adjust("1 second");
			const result = yield* Fiber.join(fiber);
			expect(result.data).toEqual({ ok: true });
		});

		await Effect.runPromise(Effect.provide(program, TestClock.layer()));
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
