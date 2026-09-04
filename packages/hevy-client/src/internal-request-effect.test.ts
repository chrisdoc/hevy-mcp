import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
	getNativeRequestEffect,
	getRequestEffectClient,
	NATIVE_REQUEST_EFFECT,
	type HevyRequestEffectClient,
} from "./internal.ts";
import * as publicClientExports from "./index.ts";
import {
	HEVY_REQUEST_ABORTED_ERROR_CODE,
	HEVY_RETRY_EXHAUSTED_ERROR_CODE,
	createHevyClient,
	HevyHttpError,
	type HevyClient,
} from "./index.ts";
import type { HevyRequestOptions } from "./execution.js";
import {
	ApiError,
	NetworkError,
	NotFoundError,
	RateLimitError,
	ValidationError,
} from "./effect-errors.js";

type ReadErrorCase = {
	readonly name: string;
	readonly invokePromise: (
		client: HevyClient,
		options?: HevyRequestOptions,
	) => Promise<unknown>;
	readonly invokeEffect: (
		client: HevyClient,
	) => Effect.Effect<unknown, unknown>;
	readonly endpoint: string;
};

type ReadSuccessCase = {
	readonly name: string;
	readonly payload: JsonObject;
	readonly invokePromise: (
		client: HevyClient,
		options?: HevyRequestOptions,
	) => Promise<unknown>;
	readonly invokeEffect: (
		client: HevyClient,
	) => Effect.Effect<unknown, unknown>;
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

function runFailure<E>(program: Effect.Effect<unknown, E>): Promise<E> {
	return Effect.runPromise(Effect.flip(program));
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
		expect(Object.keys(client)).not.toContain("requestEffect");
		expect(
			Object.getOwnPropertyDescriptor(client, NATIVE_REQUEST_EFFECT),
		).toMatchObject({ enumerable: false });
	});

	it("throws a TypeError when a client has no native request Effect seam", () => {
		expect(() => getNativeRequestEffect({} as never)).toThrowError(
			new TypeError(
				"Expected a Hevy client with the internal request Effect seam",
			),
		);
	});

	type MethodCase = {
		readonly name: keyof HevyRequestEffectClient;
		readonly invokePromise: (
			client: HevyClient,
			options?: HevyRequestOptions,
		) => Promise<unknown>;
		readonly invokeEffect: (
			client: HevyRequestEffectClient,
			options?: HevyRequestOptions,
		) => Effect.Effect<unknown, unknown>;
	};

	const methodCases: MethodCase[] = [
		{
			name: "getWorkouts",
			invokePromise: (client, options) =>
				client.getWorkouts({ page: 2, pageSize: 7 }, options),
			invokeEffect: (client, options) =>
				client.getWorkouts({ page: 2, pageSize: 7 }, options),
		},
		{
			name: "getWorkout",
			invokePromise: (client, options) =>
				client.getWorkout("workout/id", options),
			invokeEffect: (client, options) =>
				client.getWorkout("workout/id", options),
		},
		{
			name: "createWorkout",
			invokePromise: (client, options) =>
				client.createWorkout({} as never, options),
			invokeEffect: (client, options) =>
				client.createWorkout({} as never, options),
		},
		{
			name: "updateWorkout",
			invokePromise: (client, options) =>
				client.updateWorkout("workout/id", {} as never, options),
			invokeEffect: (client, options) =>
				client.updateWorkout("workout/id", {} as never, options),
		},
		{
			name: "getWorkoutEvents",
			invokePromise: (client, options) =>
				client.getWorkoutEvents(
					{
						since: "2025-01-01T00:00:00.000Z",
						page: 2,
						pageSize: 7,
					},
					options,
				),
			invokeEffect: (client, options) =>
				client.getWorkoutEvents(
					{
						since: "2025-01-01T00:00:00.000Z",
						page: 2,
						pageSize: 7,
					},
					options,
				),
		},
		{
			name: "getWorkoutCount",
			invokePromise: (client, options) => client.getWorkoutCount(options),
			invokeEffect: (client, options) => client.getWorkoutCount(options),
		},
		{
			name: "getRoutines",
			invokePromise: (client, options) =>
				client.getRoutines({ page: 2, pageSize: 7 }, options),
			invokeEffect: (client, options) =>
				client.getRoutines({ page: 2, pageSize: 7 }, options),
		},
		{
			name: "getRoutineById",
			invokePromise: (client, options) =>
				client.getRoutineById("routine/id", options),
			invokeEffect: (client, options) =>
				client.getRoutineById("routine/id", options),
		},
		{
			name: "createRoutine",
			invokePromise: (client, options) =>
				client.createRoutine({} as never, options),
			invokeEffect: (client, options) =>
				client.createRoutine({} as never, options),
		},
		{
			name: "updateRoutine",
			invokePromise: (client, options) =>
				client.updateRoutine("routine/id", {} as never, options),
			invokeEffect: (client, options) =>
				client.updateRoutine("routine/id", {} as never, options),
		},
		{
			name: "getExerciseTemplates",
			invokePromise: (client, options) =>
				client.getExerciseTemplates({ page: 2, pageSize: 7 }, options),
			invokeEffect: (client, options) =>
				client.getExerciseTemplates({ page: 2, pageSize: 7 }, options),
		},
		{
			name: "getExerciseTemplate",
			invokePromise: (client, options) =>
				client.getExerciseTemplate("template/id", options),
			invokeEffect: (client, options) =>
				client.getExerciseTemplate("template/id", options),
		},
		{
			name: "getExerciseHistory",
			invokePromise: (client, options) =>
				client.getExerciseHistory(
					"template/id",
					{
						start_date: "2025-01-01T00:00:00.000Z",
						end_date: "2025-02-01T00:00:00.000Z",
					},
					options,
				),
			invokeEffect: (client, options) =>
				client.getExerciseHistory(
					"template/id",
					{
						start_date: "2025-01-01T00:00:00.000Z",
						end_date: "2025-02-01T00:00:00.000Z",
					},
					options,
				),
		},
		{
			name: "createExerciseTemplate",
			invokePromise: (client, options) =>
				client.createExerciseTemplate({} as never, options),
			invokeEffect: (client, options) =>
				client.createExerciseTemplate({} as never, options),
		},
		{
			name: "getRoutineFolders",
			invokePromise: (client, options) =>
				client.getRoutineFolders({ page: 2, pageSize: 7 }, options),
			invokeEffect: (client, options) =>
				client.getRoutineFolders({ page: 2, pageSize: 7 }, options),
		},
		{
			name: "getRoutineFolder",
			invokePromise: (client, options) =>
				client.getRoutineFolder("folder/id", options),
			invokeEffect: (client, options) =>
				client.getRoutineFolder("folder/id", options),
		},
		{
			name: "createRoutineFolder",
			invokePromise: (client, options) =>
				client.createRoutineFolder({} as never, options),
			invokeEffect: (client, options) =>
				client.createRoutineFolder({} as never, options),
		},
		{
			name: "getBodyMeasurements",
			invokePromise: (client, options) =>
				client.getBodyMeasurements({ page: 2, pageSize: 7 }, options),
			invokeEffect: (client, options) =>
				client.getBodyMeasurements({ page: 2, pageSize: 7 }, options),
		},
		{
			name: "getBodyMeasurement",
			invokePromise: (client, options) =>
				client.getBodyMeasurement("2025-01-02", options),
			invokeEffect: (client, options) =>
				client.getBodyMeasurement("2025-01-02", options),
		},
		{
			name: "createBodyMeasurement",
			invokePromise: (client, options) =>
				client.createBodyMeasurement({} as never, options),
			invokeEffect: (client, options) =>
				client.createBodyMeasurement({} as never, options),
		},
		{
			name: "updateBodyMeasurement",
			invokePromise: (client, options) =>
				client.updateBodyMeasurement("2025-01-02", {} as never, options),
			invokeEffect: (client, options) =>
				client.updateBodyMeasurement("2025-01-02", {} as never, options),
		},
		{
			name: "getUserInfo",
			invokePromise: (client, options) => client.getUserInfo(options),
			invokeEffect: (client, options) => client.getUserInfo(options),
		},
	];

	it("exposes exactly the 22 public methods as native Effects", async () => {
		const fetchMock = vi
			.fn()
			.mockImplementation(() => Promise.resolve(response({})));
		const client = createHevyClient({
			apiKey: "test-key",
			fetch: fetchMock,
			maxGetRetries: 0,
		});
		const effectClient = getRequestEffectClient(client);
		const expectedMethods = methodCases.map(({ name }) => name).sort();

		expect(Object.keys(effectClient).sort()).toEqual(expectedMethods);
		for (const testCase of methodCases) {
			const program = testCase.invokeEffect(effectClient);
			expect(program).not.toBeInstanceOf(Promise);
			await expect(Effect.runPromise(program)).resolves.toEqual({});
		}
	});

	it("keeps all public methods Promise-shaped at runtime", async () => {
		const fetchMock = vi
			.fn()
			.mockImplementation(() => Promise.resolve(response({})));
		const client = createHevyClient({
			apiKey: "test-key",
			fetch: fetchMock,
			maxGetRetries: 0,
		});

		const requests = methodCases.map(({ invokePromise }) =>
			invokePromise(client),
		);
		for (const request of requests) {
			expect(request).toBeInstanceOf(Promise);
		}
		await Promise.all(requests);
		expect(fetchMock).toHaveBeenCalledTimes(methodCases.length);
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

	it.each(methodCases)(
		"$name has the same native request as its Promise twin",
		async (testCase) => {
			const payload = { ok: true, method: testCase.name };
			const promiseFetch = vi.fn().mockResolvedValue(response(payload));
			const promiseClient = createHevyClient({
				apiKey: "test-key",
				baseUrl: "https://example.test",
				fetch: promiseFetch,
				maxGetRetries: 0,
			});
			const promiseValue = await testCase.invokePromise(promiseClient);

			const effectFetch = vi.fn().mockResolvedValue(response(payload));
			const effectClient = createHevyClient({
				apiKey: "test-key",
				baseUrl: "https://example.test",
				fetch: effectFetch,
				maxGetRetries: 0,
			});
			const effectValue = await Effect.runPromise(
				testCase.invokeEffect(getRequestEffectClient(effectClient)),
			);

			expect(effectValue).toEqual(promiseValue);
			expect(requestDetails(effectFetch)).toEqual(requestDetails(promiseFetch));
		},
	);

	it("keeps Promise createRoutine's empty response quirk off the Effect surface", async () => {
		const promiseClient = createHevyClient({
			apiKey: "test-key",
			fetch: vi.fn().mockResolvedValue(response({})),
			maxGetRetries: 0,
		});
		await expect(
			promiseClient.createRoutine({} as never),
		).resolves.toBeUndefined();

		const effectFetch = vi.fn().mockResolvedValue(response({}));
		const effectClient = createHevyClient({
			apiKey: "test-key",
			fetch: effectFetch,
			maxGetRetries: 0,
		});
		const promiseMethod = vi.spyOn(effectClient, "createRoutine");
		await expect(
			Effect.runPromise(
				getRequestEffectClient(effectClient).createRoutine({} as never),
			),
		).resolves.toEqual({});
		expect(promiseMethod).not.toHaveBeenCalled();
		expect(effectFetch).toHaveBeenCalledOnce();
	});

	it("runs Effect and Promise twins as independent interpreter requests", async () => {
		const fetchMock = vi
			.fn()
			.mockImplementation(() => Promise.resolve(response({ id: "workout-1" })));
		const client = createHevyClient({
			apiKey: "test-key",
			fetch: fetchMock,
			maxGetRetries: 0,
		});
		const effectClient = getRequestEffectClient(client);
		const program = effectClient.getWorkout("workout-1");
		expect(program).not.toBeInstanceOf(Promise);

		const [effectValue, promiseValue] = await Promise.all([
			Effect.runPromise(program),
			client.getWorkout("workout-1"),
		]);

		expect(effectValue).toEqual(promiseValue);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

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
		"$name keeps Promise HevyHttpError and maps Effect failure to ApiError",
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
			expect(effectError).toBeInstanceOf(ApiError);
			expect(promiseError).toMatchObject({
				method: "GET",
				endpoint: testCase.endpoint,
				status: 500,
			});
			expect(effectError).toMatchObject({
				_tag: "ApiError",
				method: "GET",
				endpoint: testCase.endpoint,
				status: 500,
			});
		},
	);

	const notFoundCases = [
		{
			name: "getWorkout",
			invoke: (client: HevyRequestEffectClient) =>
				client.getWorkout("workout-1"),
			endpoint: "/v1/workouts/:workoutId",
		},
		{
			name: "getRoutineById",
			invoke: (client: HevyRequestEffectClient) =>
				client.getRoutineById("routine-1"),
			endpoint: "/v1/routines/:routineId",
		},
		{
			name: "getExerciseTemplate",
			invoke: (client: HevyRequestEffectClient) =>
				client.getExerciseTemplate("template-1"),
			endpoint: "/v1/exercise_templates/:exerciseTemplateId",
		},
		{
			name: "getRoutineFolder",
			invoke: (client: HevyRequestEffectClient) =>
				client.getRoutineFolder("folder-1"),
			endpoint: "/v1/routine_folders/:folderId",
		},
		{
			name: "getBodyMeasurement",
			invoke: (client: HevyRequestEffectClient) =>
				client.getBodyMeasurement("2025-01-02"),
			endpoint: "/v1/body_measurements/:date",
		},
		{
			name: "getUserInfo",
			invoke: (client: HevyRequestEffectClient) => client.getUserInfo(),
			endpoint: "/v1/user/info",
		},
	] as const;

	it.each(notFoundCases)(
		"$name maps HTTP 404 to NotFoundError",
		async ({ invoke, endpoint }) => {
			const client = createHevyClient({
				apiKey: "test-key",
				fetch: vi.fn().mockResolvedValue(response({}, 404)),
				maxGetRetries: 0,
			});

			const error = await runFailure(invoke(getRequestEffectClient(client)));

			expect(error).toBeInstanceOf(NotFoundError);
			expect(error).toMatchObject({
				_tag: "NotFoundError",
				status: 404,
				method: "GET",
				endpoint,
				expected: endpoint !== "/v1/user/info",
			});
		},
	);

	const validationCases = [
		{
			name: "getWorkouts",
			invoke: (client: HevyRequestEffectClient) => client.getWorkouts(),
			method: "GET",
			endpoint: "/v1/workouts",
		},
		{
			name: "createWorkout",
			invoke: (client: HevyRequestEffectClient) =>
				client.createWorkout({} as never),
			method: "POST",
			endpoint: "/v1/workouts",
		},
		{
			name: "updateWorkout",
			invoke: (client: HevyRequestEffectClient) =>
				client.updateWorkout("workout-1", {} as never),
			method: "PUT",
			endpoint: "/v1/workouts/:workoutId",
		},
		{
			name: "createRoutine",
			invoke: (client: HevyRequestEffectClient) =>
				client.createRoutine({} as never),
			method: "POST",
			endpoint: "/v1/routines",
		},
		{
			name: "createExerciseTemplate",
			invoke: (client: HevyRequestEffectClient) =>
				client.createExerciseTemplate({} as never),
			method: "POST",
			endpoint: "/v1/exercise_templates",
		},
	] as const;

	it.each(validationCases)(
		"$name maps HTTP 400 to ValidationError",
		async ({ invoke, method, endpoint }) => {
			const client = createHevyClient({
				apiKey: "test-key",
				fetch: vi.fn().mockResolvedValue(response({}, 400)),
				maxGetRetries: 0,
			});

			const error = await runFailure(invoke(getRequestEffectClient(client)));

			expect(error).toBeInstanceOf(ValidationError);
			expect(error).toMatchObject({
				_tag: "ValidationError",
				status: 400,
				method,
				endpoint,
			});
		},
	);

	it("maps HTTP 429 to RateLimitError and preserves retry parity", async () => {
		vi.useFakeTimers();
		try {
			const promiseFetch = vi.fn().mockImplementation(
				() =>
					new Response("{}", {
						status: 429,
						headers: { "Retry-After": "2" },
					}),
			);
			const promiseClient = createHevyClient({
				apiKey: "test-key",
				fetch: promiseFetch,
				maxGetRetries: 1,
			});
			const promiseRequest = promiseClient.getWorkout("workout-1");
			const promiseResult =
				expect(promiseRequest).rejects.toBeInstanceOf(HevyHttpError);
			await vi.advanceTimersByTimeAsync(0);
			await vi.advanceTimersByTimeAsync(2_250);
			await promiseResult;

			const effectFetch = vi.fn().mockImplementation(
				() =>
					new Response("{}", {
						status: 429,
						headers: { "Retry-After": "2" },
					}),
			);
			const effectClient = createHevyClient({
				apiKey: "test-key",
				fetch: effectFetch,
				maxGetRetries: 1,
			});
			const effectRequest = Effect.runPromise(
				getRequestEffectClient(effectClient)
					.getWorkout("workout-1")
					.pipe(Effect.flip),
			);
			await vi.advanceTimersByTimeAsync(0);
			await vi.advanceTimersByTimeAsync(2_250);
			const error = await effectRequest;

			expect(error).toBeInstanceOf(RateLimitError);
			expect(error).toMatchObject({
				_tag: "RateLimitError",
				status: 429,
				method: "GET",
				endpoint: "/v1/workouts/:workoutId",
				retryAfterSeconds: 2,
			});
			expect(effectFetch).toHaveBeenCalledTimes(promiseFetch.mock.calls.length);
			expect(effectFetch).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it.each([401, 403, 409, 500])("maps HTTP %s to ApiError", async (status) => {
		const client = createHevyClient({
			apiKey: "test-key",
			fetch: vi.fn().mockResolvedValue(response({}, status)),
			maxGetRetries: 0,
		});

		const error = await Effect.runPromise(
			getRequestEffectClient(client).getWorkout("workout-1").pipe(Effect.flip),
		);

		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({
			_tag: "ApiError",
			status,
			method: "GET",
			endpoint: "/v1/workouts/:workoutId",
		});
	});

	it("maps fetch rejection to NetworkError with retry exhaustion metadata", async () => {
		vi.useFakeTimers();
		try {
			const promiseFetch = vi
				.fn()
				.mockRejectedValue(new TypeError("fetch failed"));
			const promiseClient = createHevyClient({
				apiKey: "test-key",
				fetch: promiseFetch,
				maxGetRetries: 1,
			});
			const promiseRequest = promiseClient.getWorkout("workout-1");
			const promiseResult =
				expect(promiseRequest).rejects.toBeInstanceOf(HevyHttpError);
			await vi.advanceTimersByTimeAsync(0);
			await vi.advanceTimersByTimeAsync(550);
			await promiseResult;

			const effectFetch = vi
				.fn()
				.mockRejectedValue(new TypeError("fetch failed"));
			const effectClient = createHevyClient({
				apiKey: "test-key",
				fetch: effectFetch,
				maxGetRetries: 1,
			});
			const effectRequest = Effect.runPromise(
				getRequestEffectClient(effectClient)
					.getWorkout("workout-1")
					.pipe(Effect.flip),
			);
			await vi.advanceTimersByTimeAsync(0);
			await vi.advanceTimersByTimeAsync(550);
			const error = await effectRequest;

			expect(error).toBeInstanceOf(NetworkError);
			expect(error).toMatchObject({
				_tag: "NetworkError",
				code: "HEVY_RETRY_EXHAUSTED",
				method: "GET",
				endpoint: "/v1/workouts/:workoutId",
				retryCount: 1,
				retryExhausted: true,
			});
			expect(effectFetch).toHaveBeenCalledTimes(promiseFetch.mock.calls.length);
			expect(effectFetch).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("keeps sanitized request identity on NetworkError for statusless fetch failures", async () => {
		const getClient = () =>
			createHevyClient({
				apiKey: "test-key",
				fetch: vi.fn().mockRejectedValue(new TypeError("fetch failed")),
				maxGetRetries: 0,
			});

		const getError = await runFailure(
			getRequestEffectClient(getClient()).getWorkout("workout-1"),
		);

		expect(getError).toBeInstanceOf(NetworkError);
		expect(getError).toMatchObject({
			_tag: "NetworkError",
			method: "GET",
			endpoint: "/v1/workouts/:workoutId",
			retryExhausted: true,
		});

		const postError = await runFailure(
			getRequestEffectClient(getClient()).createWorkout({
				workout: {
					title: "Push",
					start_time: "2026-07-16T10:00:00Z",
					end_time: "2026-07-16T11:00:00Z",
					exercises: [],
				},
			}),
		);

		expect(postError).toBeInstanceOf(NetworkError);
		expect(postError).toMatchObject({
			_tag: "NetworkError",
			method: "POST",
			endpoint: "/v1/workouts",
		});

		const serialized = JSON.stringify([getError, postError]);
		expect(serialized).not.toContain("api.hevyapp.com");
		expect(serialized).not.toContain("test-key");
	});

	it("preserves tagged errors for Effect.catchTag", async () => {
		const notFoundClient = createHevyClient({
			apiKey: "test-key",
			fetch: vi.fn().mockResolvedValue(response({}, 404)),
			maxGetRetries: 0,
		});
		const notFoundResult = getRequestEffectClient(notFoundClient)
			.getWorkout("workout-1")
			.pipe(
				Effect.catchTag("NotFoundError", (error) =>
					Effect.succeed(`${error._tag}:${error.endpoint}`),
				),
			);
		await expect(Effect.runPromise(notFoundResult)).resolves.toBe(
			"NotFoundError:/v1/workouts/:workoutId",
		);

		const validationClient = createHevyClient({
			apiKey: "test-key",
			fetch: vi.fn().mockResolvedValue(response({}, 400)),
			maxGetRetries: 0,
		});
		const validationResult = getRequestEffectClient(validationClient)
			.getWorkouts()
			.pipe(
				Effect.catchTag("ValidationError", (error) =>
					Effect.succeed(`${error._tag}:${error.status}`),
				),
			);
		await expect(Effect.runPromise(validationResult)).resolves.toBe(
			"ValidationError:400",
		);

		const rateLimitClient = createHevyClient({
			apiKey: "test-key",
			fetch: vi.fn().mockResolvedValue(response({}, 429)),
			maxGetRetries: 0,
		});
		const rateLimitResult = getRequestEffectClient(rateLimitClient)
			.getWorkout("workout-1")
			.pipe(
				Effect.catchTag("RateLimitError", (error) =>
					Effect.succeed(`${error._tag}:${error.status}`),
				),
			);
		await expect(Effect.runPromise(rateLimitResult)).resolves.toBe(
			"RateLimitError:429",
		);

		const apiClient = createHevyClient({
			apiKey: "test-key",
			fetch: vi.fn().mockResolvedValue(response({}, 500)),
			maxGetRetries: 0,
		});
		const apiResult = getRequestEffectClient(apiClient)
			.getWorkout("workout-1")
			.pipe(
				Effect.catchTag("ApiError", (error) =>
					Effect.succeed(`${error._tag}:${error.status}`),
				),
			);
		await expect(Effect.runPromise(apiResult)).resolves.toBe("ApiError:500");

		const networkClient = createHevyClient({
			apiKey: "test-key",
			fetch: vi.fn().mockRejectedValue(new TypeError("fetch failed")),
			maxGetRetries: 0,
		});
		const networkResult = getRequestEffectClient(networkClient)
			.getWorkout("workout-1")
			.pipe(
				Effect.catchTag("NetworkError", (error) =>
					Effect.succeed(`${error._tag}:${error.retryExhausted}`),
				),
			);
		await expect(Effect.runPromise(networkResult)).resolves.toBe(
			"NetworkError:true",
		);
	});

	it("shares retry-then-success behavior between Promise and Effect reads", async () => {
		vi.useFakeTimers();
		try {
			const promiseFetch = vi
				.fn()
				.mockResolvedValueOnce(response({}, 503))
				.mockResolvedValueOnce(response({ id: "workout-1" }));
			const promiseClient = createHevyClient({
				apiKey: "test-key",
				fetch: promiseFetch,
				maxGetRetries: 1,
			});
			const promiseRequest = promiseClient.getWorkout("workout-1");
			const promiseResult = promiseRequest.catch((error: Error | string) => {
				if (error instanceof Error) return error;
				throw new Error(`Expected an Error, got ${String(error)}`);
			});
			await vi.advanceTimersByTimeAsync(0);
			await vi.advanceTimersByTimeAsync(550);
			const promiseValue = await promiseResult;

			const effectFetch = vi
				.fn()
				.mockResolvedValueOnce(response({}, 503))
				.mockResolvedValueOnce(response({ id: "workout-1" }));
			const effectClient = createHevyClient({
				apiKey: "test-key",
				fetch: effectFetch,
				maxGetRetries: 1,
			});
			const effectRequest = Effect.runPromise(
				getRequestEffectClient(effectClient).getWorkout("workout-1"),
			);
			await vi.advanceTimersByTimeAsync(0);
			await vi.advanceTimersByTimeAsync(550);
			const effectValue = await effectRequest;

			expect(effectValue).toEqual(promiseValue);
			expect(effectFetch).toHaveBeenCalledTimes(promiseFetch.mock.calls.length);
			expect(effectFetch).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("shares retry exhaustion between Promise and Effect reads", async () => {
		vi.useFakeTimers();
		try {
			const promiseFetch = vi.fn().mockImplementation(() => response({}, 503));
			const promiseClient = createHevyClient({
				apiKey: "test-key",
				fetch: promiseFetch,
				maxGetRetries: 1,
			});
			const promiseRequest = promiseClient.getWorkout("workout-1");
			const promiseResult = promiseRequest.catch((error: Error | string) => {
				if (error instanceof Error) return error;
				throw new Error(`Expected an Error, got ${String(error)}`);
			});
			await vi.advanceTimersByTimeAsync(0);
			await vi.advanceTimersByTimeAsync(550);
			const promiseError = await promiseResult;

			const effectFetch = vi.fn().mockImplementation(() => response({}, 503));
			const effectClient = createHevyClient({
				apiKey: "test-key",
				fetch: effectFetch,
				maxGetRetries: 1,
			});
			const effectRequest = Effect.runPromise(
				getRequestEffectClient(effectClient)
					.getWorkout("workout-1")
					.pipe(Effect.flip),
			);
			await vi.advanceTimersByTimeAsync(0);
			await vi.advanceTimersByTimeAsync(550);
			const effectError = await effectRequest;

			expect(promiseError).toMatchObject({
				code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
			});
			expect(effectError).toMatchObject({
				_tag: "ApiError",
				status: 503,
			});
			expect(effectFetch).toHaveBeenCalledTimes(promiseFetch.mock.calls.length);
			expect(effectFetch).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("uses the same fetch, api key, and retry configuration for a new GET", async () => {
		const params = {
			since: "2025-01-01T00:00:00.000Z",
			page: 2,
			pageSize: 5,
		};
		const payload = {
			page: 2,
			page_count: 2,
			events: [{ id: "event-1" }],
		};
		const promiseFetch = vi
			.fn()
			.mockResolvedValueOnce(response({}, 503))
			.mockResolvedValueOnce(response(payload));
		const promiseClient = createHevyClient({
			apiKey: "test-key",
			baseUrl: "https://example.test",
			fetch: promiseFetch,
			maxGetRetries: 1,
			sleep: async () => {},
		});
		const promiseValue = await promiseClient.getWorkoutEvents(params);

		const effectFetch = vi
			.fn()
			.mockResolvedValueOnce(response({}, 503))
			.mockResolvedValueOnce(response(payload));
		const effectClient = createHevyClient({
			apiKey: "test-key",
			baseUrl: "https://example.test",
			fetch: effectFetch,
			maxGetRetries: 1,
			sleep: async () => {},
		});
		const effectValue = await Effect.runPromise(
			getRequestEffectClient(effectClient).getWorkoutEvents(params),
		);

		expect(effectValue).toEqual(promiseValue);
		expect(promiseFetch).toHaveBeenCalledTimes(2);
		expect(effectFetch).toHaveBeenCalledTimes(2);
		expect(requestDetails(effectFetch)).toEqual(requestDetails(promiseFetch));
		expect(requestDetails(effectFetch).headers["api-key"]).toBe("test-key");
	});

	it("matches Promise retry exhaustion for a new GET", async () => {
		const promiseFetch = vi.fn().mockResolvedValue(response({}, 503));
		const promiseClient = createHevyClient({
			apiKey: "test-key",
			fetch: promiseFetch,
			maxGetRetries: 1,
			sleep: async () => {},
		});
		await expect(
			promiseClient.getWorkoutEvents({ page: 1, pageSize: 5 }),
		).rejects.toBeDefined();

		const effectFetch = vi.fn().mockResolvedValue(response({}, 503));
		const effectClient = createHevyClient({
			apiKey: "test-key",
			fetch: effectFetch,
			maxGetRetries: 1,
			sleep: async () => {},
		});
		await expect(
			Effect.runPromise(
				getRequestEffectClient(effectClient).getWorkoutEvents({
					page: 1,
					pageSize: 5,
				}),
			),
		).rejects.toBeDefined();

		expect(promiseFetch).toHaveBeenCalledTimes(2);
		expect(effectFetch).toHaveBeenCalledTimes(2);
	});

	it("does not retry POST mutations and keeps PUT attempts in parity", async () => {
		const promisePostFetch = vi.fn().mockResolvedValue(response({}, 503));
		const promisePostClient = createHevyClient({
			apiKey: "test-key",
			fetch: promisePostFetch,
			maxGetRetries: 3,
		});
		await expect(
			promisePostClient.createWorkout({} as never),
		).rejects.toBeDefined();

		const effectPostFetch = vi.fn().mockResolvedValue(response({}, 503));
		const effectPostClient = createHevyClient({
			apiKey: "test-key",
			fetch: effectPostFetch,
			maxGetRetries: 3,
		});
		await expect(
			Effect.runPromise(
				getRequestEffectClient(effectPostClient).createWorkout({} as never),
			),
		).rejects.toBeDefined();

		const promisePutFetch = vi.fn().mockResolvedValue(response({}, 503));
		const promisePutClient = createHevyClient({
			apiKey: "test-key",
			fetch: promisePutFetch,
			maxGetRetries: 1,
			sleep: async () => {},
		});
		await expect(
			promisePutClient.updateWorkout("workout-1", {} as never),
		).rejects.toBeDefined();

		const effectPutFetch = vi.fn().mockResolvedValue(response({}, 503));
		const effectPutClient = createHevyClient({
			apiKey: "test-key",
			fetch: effectPutFetch,
			maxGetRetries: 1,
			sleep: async () => {},
		});
		await expect(
			Effect.runPromise(
				getRequestEffectClient(effectPutClient).updateWorkout(
					"workout-1",
					{} as never,
				),
			),
		).rejects.toBeDefined();

		expect(promisePostFetch).toHaveBeenCalledOnce();
		expect(effectPostFetch).toHaveBeenCalledOnce();
		expect(promisePutFetch).toHaveBeenCalledTimes(2);
		expect(effectPutFetch).toHaveBeenCalledTimes(
			promisePutFetch.mock.calls.length,
		);
	});

	it.each([400, 404])(
		"does not retry GET or POST for HTTP %s",
		async (status) => {
			const promiseGetFetch = vi.fn().mockResolvedValue(response({}, status));
			const promiseGetClient = createHevyClient({
				apiKey: "test-key",
				fetch: promiseGetFetch,
				maxGetRetries: 3,
			});
			await expect(
				promiseGetClient.getWorkout("workout-1"),
			).rejects.toBeDefined();

			const effectGetFetch = vi.fn().mockResolvedValue(response({}, status));
			const effectGetClient = createHevyClient({
				apiKey: "test-key",
				fetch: effectGetFetch,
				maxGetRetries: 3,
			});
			await expect(
				Effect.runPromise(
					getRequestEffectClient(effectGetClient).getWorkout("workout-1"),
				),
			).rejects.toBeDefined();

			const promisePostFetch = vi.fn().mockResolvedValue(response({}, status));
			const promisePostClient = createHevyClient({
				apiKey: "test-key",
				fetch: promisePostFetch,
				maxGetRetries: 3,
			});
			await expect(
				promisePostClient.createWorkout({} as never),
			).rejects.toBeDefined();

			const effectPostFetch = vi.fn().mockResolvedValue(response({}, status));
			const effectPostClient = createHevyClient({
				apiKey: "test-key",
				fetch: effectPostFetch,
				maxGetRetries: 3,
			});
			await expect(
				Effect.runPromise(
					getRequestEffectClient(effectPostClient).createWorkout({} as never),
				),
			).rejects.toBeDefined();

			expect(promiseGetFetch).toHaveBeenCalledOnce();
			expect(effectGetFetch).toHaveBeenCalledOnce();
			expect(promisePostFetch).toHaveBeenCalledOnce();
			expect(effectPostFetch).toHaveBeenCalledOnce();
		},
	);

	it("forwards an already-aborted signal to every Effect method", async () => {
		const controller = new AbortController();
		controller.abort(new DOMException("caller canceled", "AbortError"));
		const options: HevyRequestOptions = { signal: controller.signal };

		for (const testCase of methodCases) {
			const promiseFetch = vi.fn();
			const promiseClient = createHevyClient({
				apiKey: "test-key",
				fetch: promiseFetch,
				maxGetRetries: 0,
			});
			await expect(
				testCase.invokePromise(promiseClient, options),
			).rejects.toMatchObject({ code: HEVY_REQUEST_ABORTED_ERROR_CODE });

			const effectFetch = vi.fn();
			const effectClient = createHevyClient({
				apiKey: "test-key",
				fetch: effectFetch,
				maxGetRetries: 0,
			});
			await expect(
				Effect.runPromise(
					testCase.invokeEffect(getRequestEffectClient(effectClient), options),
				),
			).rejects.toMatchObject({ code: HEVY_REQUEST_ABORTED_ERROR_CODE });

			expect(promiseFetch).not.toHaveBeenCalled();
			expect(effectFetch).not.toHaveBeenCalled();
		}
	});

	it("keeps deadline and timeout failures aligned with Promise methods", async () => {
		const promiseDeadlineFetch = vi.fn();
		const promiseDeadlineClient = createHevyClient({
			apiKey: "test-key",
			fetch: promiseDeadlineFetch,
			maxGetRetries: 0,
		});
		await expect(
			promiseDeadlineClient.getUserInfo({ deadline: 0 }),
		).rejects.toMatchObject({
			code: "HEVY_DEADLINE_EXCEEDED",
		});

		const effectDeadlineFetch = vi.fn();
		const effectDeadlineClient = createHevyClient({
			apiKey: "test-key",
			fetch: effectDeadlineFetch,
			maxGetRetries: 0,
		});
		await expect(
			Effect.runPromise(
				getRequestEffectClient(effectDeadlineClient).getUserInfo({
					deadline: 0,
				}),
			),
		).rejects.toMatchObject({
			code: "HEVY_DEADLINE_EXCEEDED",
		});

		const promiseTimeoutClient = createHevyClient({
			apiKey: "test-key",
			fetch: () => new Promise<Response>(() => {}),
			maxGetRetries: 0,
		});
		await expect(
			promiseTimeoutClient.getWorkout("workout-1", { timeoutMs: 1 }),
		).rejects.toMatchObject({
			code: "HEVY_DEADLINE_EXCEEDED",
		});

		const effectTimeoutClient = createHevyClient({
			apiKey: "test-key",
			fetch: () => new Promise<Response>(() => {}),
			maxGetRetries: 0,
		});
		await expect(
			Effect.runPromise(
				getRequestEffectClient(effectTimeoutClient).getWorkout("workout-1", {
					timeoutMs: 1,
				}),
			),
		).rejects.toMatchObject({
			code: "HEVY_DEADLINE_EXCEEDED",
		});

		expect(promiseDeadlineFetch).not.toHaveBeenCalled();
		expect(effectDeadlineFetch).not.toHaveBeenCalled();
	});
});
