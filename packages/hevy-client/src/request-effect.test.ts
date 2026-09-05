import { describe, expect, it, vi } from "vitest";
import { Cause, Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";

import { createNativeClient } from "./hevy-client-kubb.js";
import { createHevyClient } from "./hevy-client.js";
import {
	getNativeRequestEffect,
	getRequestEffectClient,
} from "./internal-request-effect.js";

describe("internal production request Effect seam", () => {
	it("represents invalid non-v1 endpoints as Effect failures", async () => {
		const client = createHevyClient({
			apiKey: "test-key",
			fetch: vi.fn(),
			maxGetRetries: 0,
		});
		const requestEffect = getNativeRequestEffect(client);

		const program = requestEffect({
			method: "GET",
			url: "https://api.hevyapp.com/private",
		});
		const error = await Effect.runPromise(Effect.flip(program));

		expect(error).toMatchObject({
			code: "HEVY_INVALID_ENDPOINT",
			endpoint: "unknown",
		});
		expect(JSON.stringify(error)).not.toContain("api.hevyapp.com");
		expect(JSON.stringify(error)).not.toContain("test-key");
	});

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

	it("lets Schedule own the retry wait instead of invoking custom sleep", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("{}", { status: 503 }))
			.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
		const sleep = vi
			.fn()
			.mockRejectedValue(new Error("custom sleep must not be used"));
		const client = createNativeClient("test-key", "https://api.hevyapp.com", {
			fetch: fetchMock,
			maxGetRetries: 1,
			sleep,
		});

		const program = Effect.gen(function* () {
			const fiber = yield* client
				.requestEffect({ method: "GET", url: "/v1/user/info" })
				.pipe(Effect.forkChild);
			yield* Effect.yieldNow;
			expect(fetchMock).toHaveBeenCalledOnce();
			expect(sleep).not.toHaveBeenCalled();
			yield* TestClock.adjust("299 millis");
			yield* Effect.yieldNow;
			expect(fetchMock).toHaveBeenCalledOnce();
			yield* TestClock.adjust("251 millis");
			return yield* Fiber.join(fiber);
		});

		await expect(
			Effect.runPromise(Effect.provide(program, TestClock.layer())),
		).resolves.toMatchObject({ data: { ok: true } });
		expect(sleep).not.toHaveBeenCalled();
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

	it("drives attempt deadlines from the Effect clock", async () => {
		let requestSignal: AbortSignal | undefined;
		const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
			requestSignal = init?.signal ?? undefined;
			return new Promise<Response>(() => {
				// TestClock, rather than a wall-clock timer, ends the attempt.
			});
		});
		const client = createNativeClient("test-key", "https://api.hevyapp.com", {
			fetch: fetchMock,
			maxGetRetries: 0,
			timeoutMs: 60_000,
		});

		const exit = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const fiber = yield* client
						.requestEffect({ method: "GET", url: "/v1/user/info" })
						.pipe(Effect.forkChild);
					yield* Effect.yieldNow;
					expect(fetchMock).toHaveBeenCalledOnce();
					yield* TestClock.adjust("60 seconds");
					return yield* Fiber.await(fiber);
				}),
				TestClock.layer(),
			),
		);

		expect(exit._tag).toBe("Failure");
		if (exit._tag !== "Failure") return;
		const error = Cause.findErrorOption(exit.cause);
		expect(error._tag).toBe("Some");
		if (error._tag !== "Some") return;
		expect(error.value).toMatchObject({
			code: "HEVY_DEADLINE_EXCEEDED",
			phase: "dispatch",
			outcome: "deadline_exceeded",
		});
		expect(requestSignal?.aborted).toBe(true);
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
