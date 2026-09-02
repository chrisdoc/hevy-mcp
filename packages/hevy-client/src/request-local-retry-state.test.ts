import { describe, expect, it, vi } from "vitest";

import { createHevyClient } from "./hevy-client.js";
import {
	HEVY_REQUEST_ABORTED_ERROR_CODE,
	HEVY_RETRY_EXHAUSTED_ERROR_CODE,
} from "./hevy-http-error.js";

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { readonly [key: string]: JsonValue };

function requestUrl(input: RequestInfo | URL): string {
	if (input instanceof URL) return input.href;
	if (input instanceof Request) return input.url;
	return input;
}

function response(data: JsonObject, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("request-local retry state", () => {
	it("resets retry indexes for sequential logical requests", async () => {
		const starts: number[] = [];
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(response({}, 503))
			.mockResolvedValueOnce(response({ request: 1 }))
			.mockResolvedValueOnce(response({}, 503))
			.mockResolvedValueOnce(response({ request: 2 }));
		const client = createHevyClient({
			apiKey: "test-key",
			fetch: fetchMock,
			maxGetRetries: 1,
			sleep: async () => {},
			onRequestStart: ({ retryCount }) => {
				starts.push(retryCount);
			},
		});

		await expect(client.getUserInfo()).resolves.toEqual({ request: 1 });
		await expect(client.getUserInfo()).resolves.toEqual({ request: 2 });

		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(starts).toEqual([0, 1, 0, 1]);
	});

	it("keeps retry indexes and budgets isolated for concurrent requests", async () => {
		const starts: Array<{ endpoint: string; retryCount: number }> = [];
		const attemptsByEndpoint = new Map<string, number>();
		const fetchMock = vi.fn((input: RequestInfo | URL) => {
			const endpoint = new URL(requestUrl(input)).pathname;
			const attempt = (attemptsByEndpoint.get(endpoint) ?? 0) + 1;
			attemptsByEndpoint.set(endpoint, attempt);
			return Promise.resolve(
				attempt === 1 ? response({}, 503) : response({ endpoint }),
			);
		});
		const client = createHevyClient({
			apiKey: "test-key",
			fetch: fetchMock,
			maxGetRetries: 1,
			sleep: async () => {},
			onRequestStart: ({ endpoint, retryCount }) => {
				starts.push({ endpoint, retryCount });
			},
		});

		const [workouts, routines] = await Promise.all([
			client.getWorkouts(),
			client.getRoutines(),
		]);

		expect(workouts).toEqual({ endpoint: "/v1/workouts" });
		expect(routines).toEqual({ endpoint: "/v1/routines" });
		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(
			starts.map(({ retryCount }) => retryCount).sort((a, b) => a - b),
		).toEqual([0, 0, 1, 1]);
	});

	it.each([
		["fractional values floor to zero", 0.9, 1],
		["negative values use the default", -1, 4],
	])("normalizes retry option: %s", async (_label, maxGetRetries, calls) => {
		const fetchMock = vi.fn().mockResolvedValue(response({}, 503));
		const client = createHevyClient({
			apiKey: "test-key",
			fetch: fetchMock,
			maxGetRetries,
			sleep: async () => {},
		});

		await expect(client.getUserInfo()).rejects.toMatchObject({
			code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
		});
		expect(fetchMock).toHaveBeenCalledTimes(calls);
	});

	it("does not let cancellation of one request cancel a concurrent request", async () => {
		const controller = new AbortController();
		let cancelledStarted!: () => void;
		const cancelledRequestStarted = new Promise<void>((resolve) => {
			cancelledStarted = resolve;
		});
		const fetchMock = vi.fn(
			(input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
				const endpoint = new URL(requestUrl(input)).pathname;
				if (endpoint === "/v1/workouts/cancelled-id") {
					cancelledStarted();
					return new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener(
							"abort",
							() => reject(init.signal?.reason),
							{ once: true },
						);
					});
				}
				return Promise.resolve(response({ recovered: true }));
			},
		);
		const client = createHevyClient({
			apiKey: "test-key",
			fetch: fetchMock,
			maxGetRetries: 1,
			onRequestStart: () => ({ finish: vi.fn() }),
		});

		const cancelled = client.getWorkout("cancelled-id", {
			signal: controller.signal,
		});
		await cancelledRequestStarted;
		const successful = client.getUserInfo();
		controller.abort(new DOMException("cancelled", "AbortError"));

		await expect(cancelled).rejects.toMatchObject({
			code: HEVY_REQUEST_ABORTED_ERROR_CODE,
		});
		await expect(successful).resolves.toEqual({ recovered: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
