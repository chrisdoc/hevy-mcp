import { describe, expect, it, vi } from "vitest";
import { HevyHttpError } from "./hevy-http-error.js";
import {
	HEVY_REQUEST_ABORTED_ERROR_CODE,
	HEVY_RETRY_EXHAUSTED_ERROR_CODE,
	createClient,
} from "./hevyClientKubb.js";

function jsonResponse(
	data: unknown,
	status = 200,
	headers?: Record<string, string>,
) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

describe("native-fetch Hevy client", () => {
	it("sends only the Hevy api-key header and safely encodes query values", async () => {
		const fetchMock = vi.fn(
			async (input: string | URL | Request, init?: RequestInit) => {
				const url = new URL(
					input instanceof Request ? input.url : input.toString(),
				);
				expect(url.origin).toBe("https://api.hevyapp.com");
				expect(url.pathname).toBe("/v1/workouts");
				expect(url.searchParams.get("page")).toBe("2");
				const headers = new Headers(init?.headers);
				expect([...headers]).toEqual([["api-key", "secret-key"]]);
				return jsonResponse({ page: 2 });
			},
		);
		const client = createClient("secret-key", undefined, { fetch: fetchMock });

		await expect(client.getWorkouts({ page: 2, pageSize: 5 })).resolves.toEqual(
			{
				page: 2,
			},
		);
	});

	it("serializes JSON writes and does not retry failed POST requests", async () => {
		const fetchMock = vi.fn(
			async (_input: string | URL | Request, init?: RequestInit) => {
				expect(init?.method).toBe("POST");
				expect(new Headers(init?.headers).get("content-type")).toBe(
					"application/json",
				);
				expect(init?.body).toBe("{}");
				return jsonResponse({ error: "unavailable" }, 503);
			},
		);
		const client = createClient("key", undefined, {
			fetch: fetchMock,
			sleep: vi.fn(),
		});

		await expect(client.createWorkout({} as never)).rejects.toMatchObject({
			status: 503,
			method: "POST",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("parses JSON error payloads into a sanitized project-owned error", async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse({ error: "invalid" }, 401),
		);
		const client = createClient("never-echo-this", undefined, {
			fetch: fetchMock,
			maxGetRetries: 0,
		});

		let thrown: unknown;
		try {
			await client.getUserInfo();
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(HevyHttpError);
		expect(thrown).toMatchObject({
			status: 401,
			data: { error: "invalid" },
			endpoint: "/v1/user/info",
		});
		expect(JSON.stringify(thrown)).not.toContain("never-echo-this");
	});

	it("retries transient GET statuses with bounded exponential delays", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ error: "busy" }, 503))
			.mockResolvedValueOnce(jsonResponse({ ok: true }));
		const sleep = vi.fn().mockResolvedValue(undefined);
		const client = createClient("key", undefined, { fetch: fetchMock, sleep });

		await expect(client.getUserInfo()).resolves.toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenCalledWith(300);
	});

	it("honors and caps Retry-After for 429 responses", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse({ error: "slow down" }, 429, { "retry-after": "60" }),
			)
			.mockResolvedValueOnce(jsonResponse({ ok: true }));
		const sleep = vi.fn().mockResolvedValue(undefined);
		const client = createClient("key", undefined, { fetch: fetchMock, sleep });

		await client.getWorkouts();
		expect(sleep).toHaveBeenCalledWith(5_000);
	});

	it("retries transient network failures for GET requests", async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new TypeError("fetch failed"))
			.mockResolvedValueOnce(jsonResponse({ ok: true }));
		const client = createClient("key", undefined, {
			fetch: fetchMock,
			sleep: vi.fn(),
		});

		await expect(client.getUserInfo()).resolves.toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("marks exhausted GET retries without exposing the original request", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 503));
		const client = createClient("key", undefined, {
			fetch: fetchMock,
			maxGetRetries: 1,
			sleep: vi.fn(),
		});

		await expect(client.getUserInfo()).rejects.toMatchObject({
			code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
			hevyRetryCount: 1,
			hevyRetryExhausted: true,
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("reports sanitized request observations through an injected hook", async () => {
		const onRequestComplete = vi.fn();
		const client = createClient("key", undefined, {
			fetch: vi.fn(async () => jsonResponse({ ok: true })),
			onRequestComplete,
		});

		await client.getWorkout("private-workout-id");
		expect(onRequestComplete).toHaveBeenCalledWith(
			expect.objectContaining({
				method: "GET",
				endpoint: "/v1/workouts/:workoutId",
				status: 200,
			}),
		);
		expect(JSON.stringify(onRequestComplete.mock.calls)).not.toContain(
			"private-workout-id",
		);
	});

	it("times out requests with a sanitized network error", async () => {
		const fetchMock = vi.fn(
			(_input: string | URL | Request, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(new DOMException("aborted", "AbortError")),
					);
				}),
		);
		const client = createClient("key", undefined, {
			fetch: fetchMock,
			maxGetRetries: 0,
			timeoutMs: 1,
		});

		await expect(client.getUserInfo()).rejects.toMatchObject({
			code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
			endpoint: "/v1/user/info",
		});
	});

	it("does not send or retry a request canceled by the caller", async () => {
		const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
		const controller = new AbortController();
		controller.abort();
		const client = createClient("key", undefined, {
			fetch: fetchMock,
			sleep: vi.fn(),
		});

		await expect(
			client.getUserInfo({ signal: controller.signal }),
		).rejects.toMatchObject({ code: HEVY_REQUEST_ABORTED_ERROR_CODE });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("does not retry a request canceled while fetch is in flight", async () => {
		const controller = new AbortController();
		const fetchMock = vi.fn(
			(_input: string | URL | Request, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(new DOMException("aborted", "AbortError")),
					);
					queueMicrotask(() => controller.abort());
				}),
		);
		const client = createClient("key", undefined, {
			fetch: fetchMock,
			sleep: vi.fn(),
		});

		await expect(
			client.getUserInfo({ signal: controller.signal }),
		).rejects.toMatchObject({ code: HEVY_REQUEST_ABORTED_ERROR_CODE });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
