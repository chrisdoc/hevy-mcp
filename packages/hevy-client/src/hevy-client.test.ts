import { describe, expect, it, vi } from "vitest";
import { createHevyClient } from "./hevy-client.js";
import {
	HEVY_REQUEST_ABORTED_ERROR_CODE,
	HEVY_RETRY_EXHAUSTED_ERROR_CODE,
	HevyHttpError,
} from "./hevy-http-error.js";
function response(data: unknown, status = 200): Response {
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
	it("uses object-form options and safely encodes requests", async () => {
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
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
				return response({ page: 2 });
			},
		);

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
	it("times out while consuming a response body", async () => {
		const fetchMock = vi.fn().mockResolvedValue(hangingResponse());
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			timeoutMs: 20,
			maxGetRetries: 0,
		});

		await expect(client.getRoutineById("routine-1")).rejects.toMatchObject({
			code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
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
			code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
		});
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
		expect(outcomes).toEqual(["terminal_failure"]);
	});

	it("bounds retries for hanging response bodies", async () => {
		const fetchMock = vi.fn().mockResolvedValue(hangingResponse());
		const client = createHevyClient({
			apiKey: "secret-key",
			fetch: fetchMock,
			timeoutMs: 20,
			maxGetRetries: 1,
			sleep: async () => {},
		});

		await expect(client.getRoutineById("routine-1")).rejects.toMatchObject({
			code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
	it("times API observations across response parsing", async () => {
		let releaseBody!: () => void;
		const bodyReady = new Promise<void>((resolve) => {
			releaseBody = resolve;
		});
		const events: string[] = [];
		const fetchMock = vi.fn(
			async () =>
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
			sleep: async (milliseconds) => {
				waits.push(milliseconds);
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
		expect(waits).toEqual([300]);
		expect(scopedRuns).toEqual([0, 0, 1]);
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

		await expect(client.getUserInfo()).rejects.toMatchObject({
			code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
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
});
