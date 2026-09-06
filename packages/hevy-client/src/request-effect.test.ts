import { describe, expect, it, vi } from "vitest";
import { Cause, Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";

import { createNativeClient } from "./hevy-client-kubb.js";
import { createHevyClient } from "./hevy-client.js";
import { getRequestEffectClient } from "./internal-request-effect.js";

describe("internal production request Effect seam", () => {
	it("routes facade GET retry delays through TestClock", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("{}", { status: 503 }))
			.mockResolvedValueOnce(
				new Response('{"id":"workout-1"}', { status: 200 }),
			);
		const client = createHevyClient({
			apiKey: "test-key",
			baseUrl: "https://api.hevyapp.com",
			fetch: fetchMock,
			maxGetRetries: 1,
		});
		const effectClient = getRequestEffectClient(client);

		const program = Effect.gen(function* () {
			const fiber = yield* effectClient
				.getWorkout("workout-1")
				.pipe(Effect.forkChild);
			yield* Effect.yieldNow;
			expect(fetchMock).toHaveBeenCalledOnce();
			yield* TestClock.adjust("1 second");
			const result = yield* Fiber.join(fiber);
			expect(result).toEqual({ id: "workout-1" });
		});

		await Effect.runPromise(Effect.provide(program, TestClock.layer()));
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

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

	it("projects an interrupted request Effect to a public client error", async () => {
		const fetchMock = vi.fn(
			() =>
				new Promise<Response>(() => {
					// The request is interrupted by its owning Effect fiber.
				}),
		);
		const client = createNativeClient("test-key", "https://api.hevyapp.com", {
			fetch: fetchMock,
			maxGetRetries: 0,
		});

		const exit = await Effect.runPromise(
			Effect.gen(function* () {
				const fiber = yield* client
					.requestEffect({ method: "GET", url: "/v1/user/info" })
					.pipe(Effect.forkChild);
				yield* Effect.yieldNow;
				yield* Fiber.interrupt(fiber);
				return yield* Fiber.await(fiber);
			}),
		);

		expect(exit._tag).toBe("Failure");
		if (exit._tag !== "Failure") return;
		const error = Cause.findErrorOption(exit.cause);
		if (error._tag === "Some") {
			expect(error.value).toMatchObject({
				code: "HEVY_REQUEST_ABORTED",
				outcome: "cancelled",
			});
		} else {
			expect(Cause.hasInterrupts(exit.cause)).toBe(true);
		}
	});

	it("projects interruption during Effect-clock backoff as cancellation", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("{}", { status: 503 }));
		const client = createNativeClient("test-key", "https://api.hevyapp.com", {
			fetch: fetchMock,
			maxGetRetries: 1,
		});

		const exit = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const fiber = yield* client
						.requestEffect({ method: "GET", url: "/v1/user/info" })
						.pipe(Effect.forkChild);
					yield* Effect.yieldNow;
					expect(fetchMock).toHaveBeenCalledOnce();
					yield* Fiber.interrupt(fiber);
					return yield* Fiber.await(fiber);
				}),
				TestClock.layer(),
			),
		);

		expect(exit._tag).toBe("Failure");
		if (exit._tag !== "Failure") return;
		const error = Cause.findErrorOption(exit.cause);
		if (error._tag === "Some") {
			expect(error.value).toMatchObject({
				code: "HEVY_REQUEST_ABORTED",
				outcome: "cancelled",
			});
		} else {
			expect(Cause.hasInterrupts(exit.cause)).toBe(true);
		}
	});

	it("does not cancel a response body after text() has locked the stream", async () => {
		let cancelled = false;
		const body = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("{}"));
				controller.close();
			},
			cancel() {
				cancelled = true;
			},
		});
		const originalCancel = body.cancel.bind(body);
		body.cancel = async (...args) => {
			cancelled = true;
			return originalCancel(...args);
		};
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(body, {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		const client = createNativeClient("test-key", "https://api.hevyapp.com", {
			fetch: fetchMock,
			maxGetRetries: 0,
		});

		await expect(
			Effect.runPromise(
				client.requestEffect({ method: "GET", url: "/v1/user/info" }),
			),
		).resolves.toMatchObject({ status: 200 });
		expect(cancelled).toBe(false);
	});
});
