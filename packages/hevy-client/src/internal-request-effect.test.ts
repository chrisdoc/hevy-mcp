import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { getNativeRequestEffect, getRequestEffectClient } from "./internal.ts";
import * as publicClientExports from "./index.ts";
import { createHevyClient, HevyHttpError, type HevyClient } from "./index.ts";

type ReadErrorCase = {
	readonly name: string;
	readonly invokePromise: (client: HevyClient) => Promise<unknown>;
	readonly invokeEffect: (client: HevyClient) => Effect.Effect<unknown, Error>;
	readonly endpoint: string;
};

type ReadSuccessCase = {
	readonly name: string;
	readonly payload: JsonObject;
	readonly invokePromise: (client: HevyClient) => Promise<unknown>;
	readonly invokeEffect: (client: HevyClient) => Effect.Effect<unknown, Error>;
};

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { readonly [key: string]: JsonValue };

function response(data: JsonObject, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function requestDetails(fetchMock: ReturnType<typeof vi.fn>) {
	const [input, init] = fetchMock.mock.calls[0] as [
		RequestInfo | URL,
		RequestInit | undefined,
	];
	const url =
		input instanceof Request
			? input.url
			: input instanceof URL
				? input.href
				: input;
	return {
		url,
		method: init?.method,
		headers: Object.fromEntries(new Headers(init?.headers)),
		body: init?.body,
	};
}

describe("@hevy-mcp/hevy-client/internal", () => {
	it("keeps the public HevyClient Promise-only at type and runtime", async () => {
		const client: HevyClient = createHevyClient({
			apiKey: "test-key",
			fetch: vi.fn().mockResolvedValue(response({})),
			maxGetRetries: 0,
		});

		const requestEffect = (() => {
			// @ts-expect-error The Effect request seam is intentionally internal.
			return client.requestEffect;
		})();
		expect("requestEffect" in client).toBe(false);
		expect("requestEffect" in publicClientExports).toBe(false);
		expect(requestEffect).toBeUndefined();

		const result = client.getWorkout("workout-1");
		expect(result).toBeInstanceOf(Promise);
		await result;
	});

	it("exports the native Effect seam without exposing it on the public client", () => {
		const client = createHevyClient({
			apiKey: "test-key",
			fetch: vi.fn().mockResolvedValue(response({})),
			maxGetRetries: 0,
		});

		const requestEffect = getNativeRequestEffect(client);
		const program = requestEffect<{ ok: boolean }>({
			method: "GET",
			url: "/v1/user/info",
		});

		expect(program).not.toBeInstanceOf(Promise);
		expect(getRequestEffectClient(client).getWorkout("workout-1")).not.toBe(
			undefined,
		);
	});

	const readSuccessCases: ReadSuccessCase[] = [
		{
			name: "getWorkouts",
			payload: { page: 2, page_count: 3, workouts: [] },
			invokePromise: (client: HevyClient) =>
				client.getWorkouts({ page: 2, pageSize: 5 }, { timeoutMs: 321 }),
			invokeEffect: (client: HevyClient) =>
				getRequestEffectClient(client).getWorkouts(
					{ page: 2, pageSize: 5 },
					{ timeoutMs: 321 },
				),
		},
		{
			name: "getWorkout",
			payload: { id: "workout-1" },
			invokePromise: (client: HevyClient) =>
				client.getWorkout("workout-1", { timeoutMs: 321 }),
			invokeEffect: (client: HevyClient) =>
				getRequestEffectClient(client).getWorkout("workout-1", {
					timeoutMs: 321,
				}),
		},
		{
			name: "getRoutines",
			payload: { page: 2, page_count: 3, routines: [] },
			invokePromise: (client: HevyClient) =>
				client.getRoutines({ page: 2, pageSize: 5 }, { timeoutMs: 321 }),
			invokeEffect: (client: HevyClient) =>
				getRequestEffectClient(client).getRoutines(
					{ page: 2, pageSize: 5 },
					{ timeoutMs: 321 },
				),
		},
		{
			name: "getRoutineById",
			payload: { routine: { id: "routine-1" } },
			invokePromise: (client: HevyClient) =>
				client.getRoutineById("routine-1", { timeoutMs: 321 }),
			invokeEffect: (client: HevyClient) =>
				getRequestEffectClient(client).getRoutineById("routine-1", {
					timeoutMs: 321,
				}),
		},
	];

	it.each(readSuccessCases)(
		"$name has the same request and success value",
		async (testCase) => {
			const promiseFetch = vi
				.fn()
				.mockResolvedValue(response(testCase.payload));
			const promiseClient = createHevyClient({
				apiKey: "test-key",
				baseUrl: "https://example.test",
				fetch: promiseFetch,
				maxGetRetries: 0,
			});
			const promiseValue = await testCase.invokePromise(promiseClient);

			const effectFetch = vi.fn().mockResolvedValue(response(testCase.payload));
			const effectClient = createHevyClient({
				apiKey: "test-key",
				baseUrl: "https://example.test",
				fetch: effectFetch,
				maxGetRetries: 0,
			});
			const effectValue = await Effect.runPromise(
				testCase.invokeEffect(effectClient),
			);

			expect(effectValue).toEqual(promiseValue);
			expect(requestDetails(effectFetch)).toEqual(requestDetails(promiseFetch));
		},
	);

	const readErrorCases: ReadErrorCase[] = [
		{
			name: "getWorkouts",
			invokePromise: (client: HevyClient) => client.getWorkouts(),
			invokeEffect: (client: HevyClient) =>
				getRequestEffectClient(client).getWorkouts(),
			endpoint: "/v1/workouts",
		},
		{
			name: "getWorkout",
			invokePromise: (client: HevyClient) => client.getWorkout("workout-1"),
			invokeEffect: (client: HevyClient) =>
				getRequestEffectClient(client).getWorkout("workout-1"),
			endpoint: "/v1/workouts/:workoutId",
		},
		{
			name: "getRoutines",
			invokePromise: (client: HevyClient) => client.getRoutines(),
			invokeEffect: (client: HevyClient) =>
				getRequestEffectClient(client).getRoutines(),
			endpoint: "/v1/routines",
		},
		{
			name: "getRoutineById",
			invokePromise: (client: HevyClient) => client.getRoutineById("routine-1"),
			invokeEffect: (client: HevyClient) =>
				getRequestEffectClient(client).getRoutineById("routine-1"),
			endpoint: "/v1/routines/:routineId",
		},
	];

	it.each(readErrorCases)(
		"$name projects the same HevyHttpError",
		async (testCase) => {
			const promiseClient = createHevyClient({
				apiKey: "test-key",
				fetch: vi.fn().mockResolvedValue(response({ error: "failed" }, 500)),
				maxGetRetries: 0,
			});
			const promiseError = await testCase.invokePromise(promiseClient).then(
				() => {
					throw new Error("Expected the Promise read to reject");
				},
				(error) => {
					if (error instanceof Error) return error;
					throw new Error(`Expected an Error, got ${String(error)}`);
				},
			);

			const effectClient = createHevyClient({
				apiKey: "test-key",
				fetch: vi.fn().mockResolvedValue(response({ error: "failed" }, 500)),
				maxGetRetries: 0,
			});
			const effectError = await Effect.runPromise(
				testCase.invokeEffect(effectClient).pipe(Effect.flip),
			);

			expect(promiseError).toBeInstanceOf(HevyHttpError);
			expect(effectError).toBeInstanceOf(HevyHttpError);
			expect(promiseError).toMatchObject({
				method: "GET",
				endpoint: testCase.endpoint,
				status: 500,
			});
			expect(effectError).toMatchObject(promiseError);
		},
	);

	it("shares retry-then-success behavior between Promise and Effect reads", async () => {
		const promiseFetch = vi
			.fn()
			.mockResolvedValueOnce(response({}, 503))
			.mockResolvedValueOnce(response({ id: "workout-1" }));
		const promiseClient = createHevyClient({
			apiKey: "test-key",
			fetch: promiseFetch,
			maxGetRetries: 1,
			sleep: async () => {},
		});
		const promiseValue = await promiseClient.getWorkout("workout-1");

		const effectFetch = vi
			.fn()
			.mockResolvedValueOnce(response({}, 503))
			.mockResolvedValueOnce(response({ id: "workout-1" }));
		const effectClient = createHevyClient({
			apiKey: "test-key",
			fetch: effectFetch,
			maxGetRetries: 1,
			sleep: async () => {},
		});
		const effectValue = await Effect.runPromise(
			getRequestEffectClient(effectClient).getWorkout("workout-1"),
		);

		expect(effectValue).toEqual(promiseValue);
		expect(effectFetch).toHaveBeenCalledTimes(promiseFetch.mock.calls.length);
		expect(effectFetch).toHaveBeenCalledTimes(2);
	});

	it("shares retry-exhausted HevyHttpError between Promise and Effect reads", async () => {
		const promiseFetch = vi.fn().mockResolvedValue(response({}, 503));
		const promiseClient = createHevyClient({
			apiKey: "test-key",
			fetch: promiseFetch,
			maxGetRetries: 1,
			sleep: async () => {},
		});
		const promiseError = await promiseClient.getWorkout("workout-1").then(
			() => {
				throw new Error("Expected the Promise read to reject");
			},
			(error) => {
				if (error instanceof Error) return error;
				throw new Error(`Expected an Error, got ${String(error)}`);
			},
		);

		const effectFetch = vi.fn().mockResolvedValue(response({}, 503));
		const effectClient = createHevyClient({
			apiKey: "test-key",
			fetch: effectFetch,
			maxGetRetries: 1,
			sleep: async () => {},
		});
		const effectError = await Effect.runPromise(
			getRequestEffectClient(effectClient)
				.getWorkout("workout-1")
				.pipe(Effect.flip),
		);

		expect(promiseFetch).toHaveBeenCalledTimes(2);
		expect(effectFetch).toHaveBeenCalledTimes(2);
		expect(promiseError).toBeInstanceOf(HevyHttpError);
		expect(effectError).toBeInstanceOf(HevyHttpError);
		expect(effectError).toMatchObject(promiseError);
	});
});
