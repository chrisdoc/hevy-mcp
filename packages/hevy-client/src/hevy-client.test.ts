import { describe, expect, it, vi } from "vitest";
import { createHevyClient } from "./hevy-client.js";
import {
	HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
	HEVY_REQUEST_ABORTED_ERROR_CODE,
	HEVY_RETRY_EXHAUSTED_ERROR_CODE,
	HevyHttpError,
} from "./hevy-http-error.js";
import { isAbortLike } from "./execution.js";
import { DEFAULT_API_TIMEOUT_MS } from "./hevy-client-kubb.js";

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { readonly [key: string]: JsonValue };

function response(data: JsonObject, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function hangingResponse(): Response {
	return new Response(
		new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('{"routine":'));
			},
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);
}

describe("@hevy-mcp/hevy-client", () => {
	it("allows slow collection endpoints a one-minute default deadline", () => {
		expect(DEFAULT_API_TIMEOUT_MS).toBe(60_000);
	});

	it("uses the per-call timeout before the constructor timeout", async () => {
		vi.useFakeTimers();
		try {
			let requestSignal: AbortSignal | undefined;
			const fetchMock = vi.fn(
				(_input: RequestInfo | URL, init?: RequestInit) =>
					new Promise<Response>((_resolve, reject) => {
						requestSignal = init?.signal ?? undefined;
						init?.signal?.addEventListener(
							"abort",
							() => reject(init.signal?.reason),
							{ once: true },
						);
					}),
			);
			const client = createHevyClient({
				apiKey: "secret-key",
				fetch: fetchMock,
				timeoutMs: 5_000,
				maxGetRetries: 0,
			});

			const request = client.getUserInfo({ timeoutMs: 25 });
			const rejected = expect(request).rejects.toMatchObject({
				code: HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
				phase: "dispatch",
				outcome: "deadline_exceeded",
			});
			await vi.advanceTimersByTimeAsync(24);
			expect(requestSignal?.aborted).toBe(false);
			await vi.advanceTimersByTimeAsync(1);

			await rejected;
			expect(requestSignal?.aborted).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it("uses object-form options and safely encodes requests", async () => {
		const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const requestUrl =
				input instanceof Request
					? input.url
					: input instanceof URL
						? input.href
						: input;
			const url = new URL(requestUrl);
			expect(url.pathname).toBe("/v1/workouts");
			expect(url.searchParams.get("page")).toBe("2");
			expect(new Headers(init?.headers).get("api-key")).toBe("secret-key");
			return Promise.resolve(response({ page: 2 }));
		});

		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 0,
		});

		await expect(client.getWorkouts({ page: 2, pageSize: 5 })).resolves.toEqual(
			{
				page: 2,
			},
		);
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("sanitizes caller-supplied HevyHttpError endpoint identities", async () => {
		const observations: string[] = [];
		const apiKey = "fixture-api-key";
		const responseSecret = "fixture-response-secret";
		const fetchMock = vi.fn().mockRejectedValue(
			new HevyHttpError(`Authorization: Bearer ${responseSecret}`, {
				status: 400,
				method: "GET",
				endpoint: "/v1/workouts/raw-workout-id",
				data: { message: `token: ${responseSecret}` },
				headers: new Headers({
					authorization: `Bearer ${responseSecret}`,
					"retry-after": "2",
				}),
				code: responseSecret,
			}),
		);
		const client = createHevyClient({
			apiKey,
			fetch: fetchMock,
			maxGetRetries: 0,
			onRequestComplete: ({ endpoint }) => observations.push(endpoint),
		});

		await expect(client.getWorkout("request-workout-id")).rejects.toMatchObject(
			{
				method: "GET",
				endpoint: "/v1/workouts/:workoutId",
			},
		);
		expect(observations).toEqual(["/v1/workouts/:workoutId"]);
		const error = await client
			.getWorkout("request-workout-id")
			.catch((cause) => cause);
		expect(error).toBeInstanceOf(HevyHttpError);
		if (!(error instanceof HevyHttpError)) return;
		expect(String(error)).not.toContain(responseSecret);
		expect(JSON.stringify(error)).not.toContain(responseSecret);
		expect(error.data).toBeUndefined();
		expect(error.headers?.get("authorization")).toBeNull();
	});

	it.each(["AbortError", "TimeoutError"])(
		"recognizes plain Error %s values as abort-like",
		(name) => {
			const error = new Error(name);
			error.name = name;
			expect(isAbortLike(error)).toBe(true);
		},
	);

	it("does not classify unrelated errors as abort-like", () => {
		expect(isAbortLike(new Error("network failure"))).toBe(false);
		expect(isAbortLike({ name: "AbortError" })).toBe(false);
	});

	it("synchronizes HevyHttpError execution aliases", () => {
		const error = new HevyHttpError("request failed", {
			method: "PUT",
			endpoint: "/v1/workouts/:workoutId",
		});
		error.setExecutionMetadata({
			phase: "dispatch",
			operationSafety: "idempotent-write",
			commitState: "unknown",
			safeToRetry: true,
			outcome: "retryable_failure",
		});

		expect(error).toMatchObject({
			phase: "dispatch",
			phase_name: "dispatch",
			operationSafety: "idempotent-write",
			operation_safety: "idempotent-write",
			commitState: "unknown",
			commit_state: "unknown",
			safeToRetry: true,
			safe_to_retry: true,
			outcome: "retryable_failure",
		});
	});

	it("emits bounded events without raw response or exception data", async () => {
		const onLog = vi.fn(() => {
			throw new Error("observer-secret");
		});
		const onRequestComplete = vi.fn(() => {
			throw new Error("completion-secret");
		});
		const fetchMock = vi
			.fn()
			.mockResolvedValue(response({ secret: "body" }, 401));
		const client = createHevyClient({
			apiKey: "api-key-secret",
			fetch: fetchMock,
			maxGetRetries: 0,
			onLog,
			onRequestComplete,
		});

		await expect(client.getUserInfo()).rejects.toBeInstanceOf(HevyHttpError);
		const eventText = JSON.stringify(onRequestComplete.mock.calls);
		expect(eventText).not.toContain("api-key-secret");
		expect(eventText).not.toContain("body");
		expect(eventText).not.toContain("observer-secret");
		expect(onLog).toHaveBeenCalled();
	});
	it("exposes only bounded, sanitized allowlisted response diagnostics", async () => {
		const observations: unknown[] = [];
		const fetchMock = vi.fn().mockResolvedValue(
			response(
				{
					message:
						"Invalid email jane@example.com; Authorization: Bearer response-secret; Cookie: session=body-secret; validation failed; see https://api.example.test/workouts/123",
					token: "body-secret",
				},
				500,
			),
		);
		const client = createHevyClient({
			apiKey: "api-key-secret",
			fetch: fetchMock,
			maxGetRetries: 0,
			onRequestComplete: (observation) => observations.push(observation),
		});

		let thrown: unknown;
		try {
			await client.getUserInfo();
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toMatchObject({
			responseError:
				"Invalid email [EMAIL_REDACTED]; Authorization: [REDACTED]; Cookie: [REDACTED]; validation failed; see [URL_REDACTED]",
		});
		const observationText = JSON.stringify(observations);
		expect(observationText).toContain("response_error");
		expect(observationText).toContain("[EMAIL_REDACTED]");
		expect(observationText).not.toContain("jane@example.com");
		expect(observationText).not.toContain("response-secret");
		expect(observationText).not.toContain("body-secret");
	});

	it("does not retain raw response secrets on rejected errors", async () => {
		const apiKey = "fixture-api-key";
		const responseSecret = "fixture-response-secret";
		const fetchMock = vi.fn().mockResolvedValue(
			response(
				{
					message: `Authorization: Bearer ${responseSecret}`,
					apiKey,
					nested: { cookie: responseSecret },
				},
				500,
			),
		);
		const client = createHevyClient({
			apiKey,
			fetch: fetchMock,
			maxGetRetries: 0,
		});

		const error = await client.getUserInfo().catch((cause) => cause);
		expect(error).toBeInstanceOf(HevyHttpError);
		if (!(error instanceof HevyHttpError)) return;

		expect(error.data).toBeUndefined();
		expect(error.headers?.get("authorization")).toBeUndefined();
		expect(JSON.stringify(error)).not.toContain(apiKey);
		expect(JSON.stringify(error)).not.toContain(responseSecret);
		expect(String(error)).not.toContain(responseSecret);
		expect(error.code).not.toBe(responseSecret);
	});

	it("times out while consuming a response body", async () => {
		const fetchMock = vi.fn(() => Promise.resolve(hangingResponse()));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			timeoutMs: 20,
			maxGetRetries: 0,
		});

		await expect(client.getRoutineById("routine-1")).rejects.toMatchObject({
			code: HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
			phase: "response-content",
			outcome: "deadline_exceeded",
		});
	});

	it("times out when fetch never settles", async () => {
		const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			timeoutMs: 20,
			maxGetRetries: 0,
		});

		await expect(client.getRoutineById("routine-1")).rejects.toMatchObject({
			code: HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
			phase: "dispatch",
			outcome: "deadline_exceeded",
		});
	});

	it("retries a read once with a fresh deadline budget after a deadline", async () => {
		const outcomes: string[] = [];
		const onLog = vi.fn();
		let waitCount = 0;
		const fetchMock = vi
			.fn()
			.mockImplementationOnce(() => new Promise<Response>(() => {}))
			.mockResolvedValueOnce(response({ recovered: true }));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			timeoutMs: 50,
			maxGetRetries: 1,
			onLog,
			onRequestComplete: ({ outcome }) => outcomes.push(outcome),
			onRetryWait: () => {
				waitCount += 1;
				return { finish: vi.fn() };
			},
		});

		await expect(client.getWorkout("workout-1")).resolves.toEqual({
			recovered: true,
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(outcomes).toEqual(["deadline_exceeded", "success"]);
		expect(waitCount).toBe(0);
		expect(
			onLog.mock.calls.some(
				([event]) => event.data.message === "Retrying Hevy API request",
			),
		).toBe(false);
	});

	it("returns the deadline error when the bounded read retry also times out", async () => {
		const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			timeoutMs: 10,
			maxGetRetries: 1,
		});

		await expect(client.getWorkout("workout-1")).rejects.toMatchObject({
			code: HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
			outcome: "deadline_exceeded",
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("allows a per-operation timeout override", async () => {
		const fetchMock = vi.fn(
			() =>
				new Promise<Response>((resolve) =>
					setTimeout(() => resolve(response({ recovered: true })), 20),
				),
		);
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			timeoutMs: 5,
			maxGetRetries: 0,
		});

		await expect(
			client.getWorkout("workout-1", { timeoutMs: 50 }),
		).resolves.toEqual({ recovered: true });
	});

	it("does not retry writes after a deadline", async () => {
		const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			timeoutMs: 10,
			maxGetRetries: 1,
		});

		await expect(
			client.createWorkout({ workout: {} } as never),
		).rejects.toMatchObject({
			code: HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
		});
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("does not grant idempotent PUT writes a free deadline retry", async () => {
		const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			timeoutMs: 10,
			maxGetRetries: 1,
		});

		await expect(
			client.updateWorkout("workout-1", {} as never),
		).rejects.toMatchObject({
			code: HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
			outcome: "deadline_exceeded",
		});
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("uses one attempt when maxGetRetries is zero", async () => {
		const fetchMock = vi.fn().mockResolvedValue(response({}, 503));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 0,
			sleep: vi.fn(),
		});

		await expect(client.getUserInfo()).rejects.toMatchObject({
			code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
			status: 503,
		});
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("shares the retry budget between transient PUT attempts", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(response({}, 503))
			.mockResolvedValueOnce(response({ updated: true }));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 1,
			sleep: async () => {},
		});

		await expect(
			client.updateWorkout("workout-1", {} as never),
		).resolves.toEqual({ updated: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("does not extend a caller-supplied deadline with a deadline retry", async () => {
		const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
		const onLog = vi.fn();
		const sleeps: number[] = [];
		let waitsOpened = 0;
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			timeoutMs: 10,
			maxGetRetries: 1,
			onLog,
			sleep: (milliseconds) => {
				sleeps.push(milliseconds);
				return Promise.resolve();
			},
			onRetryWait: () => {
				waitsOpened += 1;
				return { finish: vi.fn() };
			},
		});
		const deadline = Date.now() + 10;

		await expect(
			client.getWorkout("workout-1", { deadline }),
		).rejects.toMatchObject({
			code: HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
			outcome: "deadline_exceeded",
		});
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(onLog).not.toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					message: "Retrying Hevy API request",
				}),
			}),
		);
		expect(sleeps).toEqual([]);
		expect(waitsOpened).toBe(0);
	});

	it("does not misclassify a non-deadline retry failure as deadline exceeded", async () => {
		const fetchMock = vi
			.fn()
			.mockImplementationOnce(() => new Promise<Response>(() => {}))
			.mockResolvedValueOnce(response({}, 500));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			timeoutMs: 50,
			maxGetRetries: 1,
		});

		await expect(client.getWorkout("workout-1")).rejects.toMatchObject({
			status: 500,
			outcome: "terminal_failure",
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
	it("finishes request observations when callers cancel", async () => {
		const controller = new AbortController();
		const outcomes: string[] = [];
		const fetchMock = vi.fn(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener(
						"abort",
						() => reject(new DOMException("Aborted", "AbortError")),
						{ once: true },
					);
				}),
		);
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 0,
			onRequestStart: () => ({
				finish: ({ outcome }) => outcomes.push(outcome),
			}),
		});

		const request = client.getUserInfo({ signal: controller.signal });
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		controller.abort();
		await expect(request).rejects.toMatchObject({
			code: HEVY_REQUEST_ABORTED_ERROR_CODE,
		});
		expect(outcomes).toEqual(["cancelled"]);
	});

	it("uses one timeout budget for hanging response bodies", async () => {
		const fetchMock = vi.fn(() => Promise.resolve(hangingResponse()));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			timeoutMs: 20,
			maxGetRetries: 1,
			sleep: async () => {},
		});

		await expect(client.getRoutineById("routine-1")).rejects.toMatchObject({
			code: HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
			phase: "response-content",
			outcome: "deadline_exceeded",
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("cancels response-content consumption through the caller signal", async () => {
		const controller = new AbortController();
		const fetchMock = vi.fn(() => Promise.resolve(hangingResponse()));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 3,
		});
		const request = client.getRoutineById("routine-1", {
			signal: controller.signal,
		});
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		controller.abort(new DOMException("caller canceled", "AbortError"));

		await expect(request).rejects.toMatchObject({
			code: HEVY_REQUEST_ABORTED_ERROR_CODE,
			message: "The request was canceled by the client.",
			phase: "response-content",
			outcome: "cancelled",
		});
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("does not restart timeoutMs during retry backoff", async () => {
		const fetchMock = vi.fn().mockResolvedValue(response({}, 503));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			timeoutMs: 20,
			maxGetRetries: 3,
			sleep: () => new Promise<void>(() => {}),
		});

		await expect(client.getUserInfo()).rejects.toMatchObject({
			code: HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
			phase: "backoff",
			outcome: "deadline_exceeded",
		});
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("times API observations across response parsing", async () => {
		let releaseBody!: () => void;
		const bodyReady = new Promise<void>((resolve) => {
			releaseBody = resolve;
		});
		const events: string[] = [];
		const fetchMock = vi.fn(() =>
			Promise.resolve(
				new Response(
					new ReadableStream({
						async start(controller) {
							await bodyReady;
							controller.enqueue(new TextEncoder().encode("{}"));
							controller.close();
						},
					}),
					{ status: 200 },
				),
			),
		);
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			onRequestStart: () => {
				events.push("start");
				return {
					finish: (observation) => events.push(`finish:${observation.outcome}`),
				};
			},
			maxGetRetries: 0,
		});

		const request = client.getUserInfo();
		await vi.waitFor(() => expect(events).toEqual(["start"]));
		releaseBody();
		await request;

		expect(events).toEqual(["start", "finish:success"]);
	});

	it("observes every retry attempt and backoff without exposing request data", async () => {
		const attempts: string[] = [];
		const waits: number[] = [];
		const outcomes: string[] = [];
		const scopedRuns: number[] = [];
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(response({}, 503))
			.mockResolvedValueOnce(response({}));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 1,
			sleep: (milliseconds) => {
				waits.push(milliseconds);
				return Promise.resolve();
			},
			onRequestStart: ({ retryCount }) => {
				attempts.push(`start:${retryCount}`);
				return {
					run: async (operation) => {
						scopedRuns.push(retryCount);
						return operation();
					},
					finish: ({ outcome }) => outcomes.push(outcome),
				};
			},
			onRetryWait: ({ retryCount }) => ({
				finish: () => attempts.push(`wait:${retryCount}`),
			}),
		});

		await client.getUserInfo();

		expect(attempts).toEqual(["start:0", "wait:1", "start:1"]);
		expect(outcomes).toEqual(["retryable_failure", "success"]);
		expect(waits[0]).toBeGreaterThanOrEqual(300);
		expect(waits[0]).toBeLessThan(550);
		expect(scopedRuns).toEqual([0, 1]);
	});

	it("does not rerun a request when an observation scope throws after starting", async () => {
		const fetchMock = vi.fn().mockResolvedValue(response({}));
		const scopeRun = vi.fn((operation: () => Promise<unknown>) => {
			void operation();
			throw new Error("observation scope failed");
		});
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 0,
			onRequestStart: () => ({
				run: scopeRun,
				finish: vi.fn(),
			}),
		});

		await expect(client.getUserInfo()).rejects.toBeInstanceOf(HevyHttpError);
		expect(scopeRun).toHaveBeenCalledOnce();
		expect(fetchMock).toHaveBeenCalledOnce();
	});
	it("falls back to the request when an observation scope fails before starting", async () => {
		const fetchMock = vi.fn().mockResolvedValue(response({}));
		const scopeRun = vi.fn(() => {
			throw new Error("observation scope unavailable");
		});
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 0,
			onRequestStart: () => ({
				run: scopeRun,
				finish: vi.fn(),
			}),
		});

		await expect(client.getUserInfo()).resolves.toEqual({});
		expect(scopeRun).toHaveBeenCalledOnce();
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("marks supported read and later-page 404s as expected outcomes", async () => {
		const observations: Array<{
			outcome: string;
			expectedReason?: string;
		}> = [];
		const fetchMock = vi.fn().mockResolvedValue(response({}, 404));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 0,
			onRequestComplete: ({ outcome, expectedReason }) => {
				observations.push({ outcome, expectedReason });
			},
		});

		await expect(client.getWorkouts({ page: 2 })).rejects.toBeInstanceOf(
			HevyHttpError,
		);

		expect(observations).toEqual([
			{ outcome: "expected", expectedReason: "end_of_list" },
		]);
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("does not retry expected or unexpected GET 404s", async () => {
		const fetchMock = vi.fn().mockImplementation(() => response({}, 404));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 3,
			sleep: vi.fn(),
		});

		await expect(client.getWorkouts({ page: 1 })).rejects.toMatchObject({
			status: 404,
		});
		await expect(client.getWorkouts({ page: 2 })).rejects.toMatchObject({
			status: 404,
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
	it("reports exhausted retries as terminal failures", async () => {
		const observations: Array<{
			outcome: string;
			code?: string;
		}> = [];
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(response({}, 503))
			.mockResolvedValueOnce(response({}, 503));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 1,
			sleep: async () => {},
			onRequestComplete: ({ outcome, error }) => {
				observations.push({ outcome, code: error?.code });
			},
		});

		const thrown = await client
			.getUserInfo()
			.catch((error: Error | string) => error);
		expect(thrown).toMatchObject({
			code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
			safeToRetry: false,
			safe_to_retry: false,
			outcome: "terminal_failure",
		});
		expect(observations).toEqual([
			{ outcome: "retryable_failure", code: undefined },
			{
				outcome: "terminal_failure",
				code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
			},
		]);
	});

	it("classifies network failures separately from HTTP failures", async () => {
		const observations: Array<{
			outcome: string;
			category?: string;
			code?: string;
		}> = [];
		const networkError = Object.assign(new TypeError("network"), {
			code: "ETIMEDOUT",
		});
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: vi.fn().mockRejectedValue(networkError),
			maxGetRetries: 0,
			onRequestComplete: ({ outcome, error }) => {
				observations.push({
					outcome,
					category: error?.category,
					code: error?.code,
				});
			},
		});

		await expect(client.getUserInfo()).rejects.toBeInstanceOf(HevyHttpError);
		expect(observations).toEqual([
			{
				outcome: "terminal_failure",
				category: "NetworkError",
				code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
			},
		]);
	});

	it("classifies synchronous pre-dispatch failures as not sent", async () => {
		const fetchMock = vi.fn(() => {
			throw Object.assign(new TypeError("socket unavailable"), {
				code: "ECONNREFUSED",
			});
		});
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 0,
		});

		await expect(client.getUserInfo()).rejects.toMatchObject({
			phase: "before-dispatch",
			commit_state: "not_sent",
			safe_to_retry: false,
			code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
		});
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("cancels an in-flight retry backoff without starting another attempt", async () => {
		const controller = new AbortController();
		let releaseSleep!: () => void;
		let sleepStarted!: () => void;
		const sleepWasStarted = new Promise<void>((resolve) => {
			sleepStarted = resolve;
		});
		const sleep = new Promise<void>((resolve) => {
			releaseSleep = resolve;
		});
		const fetchMock = vi.fn().mockResolvedValue(response({}, 503));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 2,
			sleep: async () => {
				sleepStarted();
				return sleep;
			},
		});

		const request = client.getUserInfo({ signal: controller.signal });
		await sleepWasStarted;
		controller.abort();
		await expect(request).rejects.toMatchObject({
			code: HEVY_REQUEST_ABORTED_ERROR_CODE,
			phase: "backoff",
			safe_to_retry: false,
		});
		expect(fetchMock).toHaveBeenCalledOnce();
		releaseSleep();
	});

	it("cancels the default retry backoff and clears its timer", async () => {
		vi.useFakeTimers();
		try {
			const controller = new AbortController();
			let retryWaitStarted!: () => void;
			const retryWait = new Promise<void>((resolve) => {
				retryWaitStarted = resolve;
			});
			const fetchMock = vi.fn().mockResolvedValue(response({}, 503));
			const client = createHevyClient({
				apiKey: "secret-key",
				fetch: fetchMock,
				maxGetRetries: 1,
				timeoutMs: 60_000,
				onRetryWait: () => {
					retryWaitStarted();
				},
			});

			const request = client.getUserInfo({ signal: controller.signal });
			await retryWait;
			controller.abort();

			await expect(request).rejects.toMatchObject({
				code: HEVY_REQUEST_ABORTED_ERROR_CODE,
				phase: "backoff",
			});
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it("uses one absolute deadline across retries and response consumption", async () => {
		let fetchStartedAt = 0;
		const fetchMock = vi.fn().mockImplementation(
			() =>
				new Promise<Response>((resolve) => {
					fetchStartedAt = Date.now();
					setTimeout(() => resolve(response({})), 200);
				}),
		);
		const deadline = Date.now() + 100;
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 0,
		});

		await expect(client.getUserInfo({ deadline })).rejects.toMatchObject({
			code: HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
			outcome: "deadline_exceeded",
		});
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(fetchStartedAt).toBeLessThan(deadline);
	});

	it("gives each retry a fresh attempt deadline", async () => {
		const fetchMock = vi
			.fn()
			.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
				if (fetchMock.mock.calls.length === 1) {
					return new Promise<Response>((resolve) => {
						setTimeout(() => resolve(response({}, 429)), 40);
					});
				}
				expect(init?.signal?.aborted).toBe(false);
				return Promise.resolve(response({ recovered: true }));
			});
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 1,
			timeoutMs: 50,
			sleep: async () => {},
		});

		await expect(client.getUserInfo()).resolves.toEqual({ recovered: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("never retries a non-idempotent write and marks dispatch uncertainty", async () => {
		const fetchMock = vi.fn().mockResolvedValue(response({}, 503));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 5,
		});

		await expect(
			client.createWorkout({ workout: {} } as never),
		).rejects.toMatchObject({
			commit_state: "unknown",
			safe_to_retry: false,
			operation_safety: "non-idempotent-write",
		});
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("derives POST safety from the HTTP method", async () => {
		const fetchMock = vi.fn().mockResolvedValue(response({}, 503));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 5,
		});

		await expect(
			client.createWorkout({ workout: {} } as never, {
				deadline: Date.now() + 1_000,
			}),
		).rejects.toMatchObject({
			commit_state: "unknown",
			safe_to_retry: false,
			operation_safety: "non-idempotent-write",
		});
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("retries idempotent PUT updates with an unknown commit state", async () => {
		const observations: Array<{
			operationSafety?: string;
			commitState?: string;
			safeToRetry?: boolean;
		}> = [];
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(response({}, 503))
			.mockResolvedValueOnce(response({ id: "workout-1" }));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 1,
			sleep: async () => {},
			onRequestComplete: ({ operationSafety, commitState, safeToRetry }) =>
				observations.push({ operationSafety, commitState, safeToRetry }),
		});

		await expect(
			client.updateWorkout("workout-1", {} as never),
		).resolves.toEqual({ id: "workout-1" });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(observations[0]).toMatchObject({
			operationSafety: "idempotent-write",
			commitState: "unknown",
			safeToRetry: true,
		});
	});

	it("adds bounded jitter when Retry-After is absent", async () => {
		const waits: number[] = [];
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(response({}, 429))
			.mockResolvedValueOnce(response({}));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 1,
			sleep: (delay) => {
				waits.push(delay);
				return Promise.resolve();
			},
		});

		await client.getUserInfo();

		expect(waits).toHaveLength(1);
		expect(waits[0]).toBeGreaterThanOrEqual(300);
		expect(waits[0]).toBeLessThan(550);
	});

	it("honors Retry-After while adding bounded jitter", async () => {
		const waits: number[] = [];
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response("{}", {
					status: 429,
					headers: { "retry-after": "2" },
				}),
			)
			.mockResolvedValueOnce(response({}));
		const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
		try {
			const client = createHevyClient({
				apiKey: "secret-key",
				fetch: fetchMock,
				maxGetRetries: 1,
				sleep: (delay) => {
					waits.push(delay);
					return Promise.resolve();
				},
			});
			await client.getUserInfo();
		} finally {
			random.mockRestore();
		}
		expect(waits).toHaveLength(1);
		expect(waits[0]).toBeGreaterThanOrEqual(2_000);
		expect(waits[0]).toBeLessThanOrEqual(2_250);
	});

	it("honors a Retry-After hint above the exponential cap", async () => {
		const waits: number[] = [];
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response("{}", {
					status: 429,
					headers: { "retry-after": "20" },
				}),
			)
			.mockResolvedValueOnce(response({}));
		const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
		try {
			const client = createHevyClient({
				apiKey: "secret-key",
				fetch: fetchMock,
				maxGetRetries: 1,
				sleep: (delay) => {
					waits.push(delay);
					return Promise.resolve();
				},
			});
			await client.getUserInfo({ deadline: Date.now() + 30_000 });
		} finally {
			random.mockRestore();
		}
		expect(waits[0]).toBeGreaterThanOrEqual(20_000);
		expect(waits[0]).toBeLessThanOrEqual(20_250);
	});

	it("completes the native retry timer before the next attempt", async () => {
		vi.useFakeTimers();
		try {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(response({}, 503))
				.mockResolvedValueOnce(response({ recovered: true }));
			const client = createHevyClient({
				apiKey: "secret-key",
				fetch: fetchMock,
				maxGetRetries: 1,
				timeoutMs: 10_000,
			});

			const request = client.getUserInfo();
			await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
			await vi.advanceTimersByTimeAsync(550);
			await expect(request).resolves.toEqual({ recovered: true });
		} finally {
			vi.useRealTimers();
		}
	});

	it("honors cancellation that arrives before retry backoff starts", async () => {
		const controller = new AbortController();
		const fetchMock = vi.fn().mockResolvedValue(response({}, 503));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 1,
			onRequestComplete: ({ outcome }) => {
				if (outcome === "retryable_failure") controller.abort();
			},
		});

		await expect(
			client.getUserInfo({ signal: controller.signal }),
		).rejects.toMatchObject({
			code: HEVY_REQUEST_ABORTED_ERROR_CODE,
			phase: "backoff",
		});
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("projects a retry sleep failure as a backoff error", async () => {
		const fetchMock = vi.fn().mockResolvedValue(response({}, 503));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 1,
			sleep: vi.fn().mockRejectedValue(new Error("sleep failed")),
		});

		await expect(client.getUserInfo()).rejects.toMatchObject({
			phase: "backoff",
			code: HEVY_REQUEST_ABORTED_ERROR_CODE,
		});
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("rejects before dispatch when the caller deadline is already elapsed", async () => {
		const fetchMock = vi.fn();
		const complete = vi.fn();
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 0,
			onRequestComplete: complete,
		});

		await expect(
			client.getUserInfo({ deadline: Date.now() - 1 }),
		).rejects.toMatchObject({
			code: HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
			phase: "before-dispatch",
		});
		expect(fetchMock).not.toHaveBeenCalled();
		expect(complete).toHaveBeenCalledWith(
			expect.objectContaining({ outcome: "deadline_exceeded" }),
		);
	});

	it("forwards every curated operation through its generated API wrapper", async () => {
		const fetchMock = vi
			.fn()
			.mockImplementation(() => Promise.resolve(response({})));
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			maxGetRetries: 0,
		});

		await client.getWorkouts({ page: 1 });
		await client.getWorkout("workout-1");
		await client.createWorkout({} as never);
		await client.updateWorkout("workout-1", {} as never);
		await client.getWorkoutCount();
		await client.getWorkoutEvents({ page: 1 });
		await client.getRoutines({ page: 1 });
		await client.getRoutineById("routine-1");
		await client.createRoutine({} as never);
		await client.updateRoutine("routine-1", {} as never);
		await client.getExerciseTemplates({ page: 1 });
		await client.getExerciseTemplate("template-1");
		await client.getExerciseHistory("template-1", { start_date: "2025-01-01" });
		await client.createExerciseTemplate({} as never);
		await client.getRoutineFolders({ page: 1 });
		await client.createRoutineFolder({} as never);
		await client.getRoutineFolder("folder-1");
		await client.getBodyMeasurements({ page: 1 });
		await client.getBodyMeasurement("2025-01-01");
		await client.createBodyMeasurement({} as never);
		await client.updateBodyMeasurement("2025-01-01", {} as never);
		await client.getUserInfo();

		expect(fetchMock).toHaveBeenCalledTimes(22);
	});

	it("bounds an over-budget Retry-After by the absolute deadline", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-03T12:00:00.000Z"));
		try {
			const waits: number[] = [];
			const fetchMock = vi.fn().mockResolvedValue(
				new Response("{}", {
					status: 429,
					headers: { "retry-after": "20" },
				}),
			);
			const client = createHevyClient({
				apiKey: "secret-key",
				fetch: fetchMock,
				maxGetRetries: 1,
				sleep: (delay) => {
					waits.push(delay);
					vi.advanceTimersByTime(delay);
					return Promise.resolve();
				},
			});
			await expect(
				client.getUserInfo({ deadline: Date.now() + 1_000 }),
			).rejects.toMatchObject({
				code: HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
				phase: "backoff",
				outcome: "deadline_exceeded",
			});
			expect(waits).toEqual([1_000]);
			expect(fetchMock).toHaveBeenCalledOnce();
		} finally {
			vi.useRealTimers();
		}
	});
});
