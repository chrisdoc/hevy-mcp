import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
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

function listen(server: ReturnType<typeof createHttpServer>): Promise<number> {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve((server.address() as AddressInfo).port);
		});
	});
}

function close(server: ReturnType<typeof createHttpServer>): Promise<void> {
	return new Promise((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
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
		expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("manual");
	});

	it("never forwards the api-key to a cross-origin redirect target", async () => {
		const secret = "redirect-confidential-key";
		let destinationRequests = 0;
		let destinationApiKey: string | string[] | undefined;
		const destination = createHttpServer((request, response) => {
			destinationRequests += 1;
			destinationApiKey = request.headers["api-key"];
			response.writeHead(200, { "content-type": "application/json" });
			response.end('{"received":true}');
		});
		const destinationPort = await listen(destination);
		const origin = createHttpServer((request, response) => {
			expect(request.headers["api-key"]).toBe(secret);
			response.writeHead(302, {
				location: `http://127.0.0.1:${destinationPort}/stolen`,
			});
			response.end();
		});
		const originPort = await listen(origin);

		try {
			const client = createClient(secret, `http://127.0.0.1:${originPort}`, {
				maxGetRetries: 0,
			});
			const error = await client.getUserInfo().catch((cause: unknown) => cause);

			expect(error).toBeInstanceOf(HevyHttpError);
			expect(error).toMatchObject({
				status: 302,
				endpoint: "/v1/user/info",
			});
			expect(JSON.stringify(error)).not.toContain(secret);
			expect(destinationRequests).toBe(0);
			expect(destinationApiKey).toBeUndefined();
		} finally {
			await Promise.all([close(origin), close(destination)]);
		}
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

	it("uses HTTP-date Retry-After values", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-11T12:00:00.000Z"));
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse({ error: "slow down" }, 429, {
					"retry-after": "Sat, 11 Jul 2026 12:00:02 GMT",
				}),
			)
			.mockResolvedValueOnce(jsonResponse({ ok: true }));
		const sleep = vi.fn().mockResolvedValue(undefined);
		const client = createClient("key", undefined, { fetch: fetchMock, sleep });

		await expect(client.getUserInfo()).resolves.toEqual({ ok: true });
		expect(sleep).toHaveBeenCalledWith(2_000);
		vi.useRealTimers();
	});

	it("uses the default retry sleep without a real delay", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ error: "busy" }, 503))
			.mockResolvedValueOnce(jsonResponse({ ok: true }));
		const client = createClient("key", undefined, { fetch: fetchMock });

		const result = client.getUserInfo();
		await vi.advanceTimersByTimeAsync(300);
		await expect(result).resolves.toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		vi.useRealTimers();
	});

	it("keeps the original HTTP failure when structured logging throws", async () => {
		const secret = "sentinel-logger-key";
		const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const client = createClient(secret, undefined, {
			fetch: vi.fn(async () => jsonResponse({ error: secret }, 400)),
			logger: () => {
				throw new Error(secret);
			},
		});

		await expect(client.createWorkout({} as never)).rejects.toMatchObject({
			status: 400,
			method: "POST",
			endpoint: "/v1/workouts",
		});
		expect(stderrSpy).toHaveBeenCalledWith(
			"Failed to emit structured Hevy API log",
		);
		expect(JSON.stringify(stderrSpy.mock.calls)).not.toContain(secret);
		stderrSpy.mockRestore();
	});

	it("returns successful non-JSON response bodies", async () => {
		const client = createClient("key", undefined, {
			fetch: vi.fn(
				async () =>
					new Response("plain success", {
						status: 200,
						headers: { "content-type": "text/plain" },
					}),
			),
		});

		await expect(client.getUserInfo()).resolves.toBe("plain success");
	});

	it("forwards representative mutation, folder, and measurement requests", async () => {
		const requests: Array<{
			url: URL;
			method: string | undefined;
			body: RequestInit["body"];
			headers: Headers;
		}> = [];
		const fetchMock = vi.fn(
			async (input: string | URL | Request, init?: RequestInit) => {
				requests.push({
					url: new URL(input instanceof Request ? input.url : input.toString()),
					method: init?.method,
					body: init?.body,
					headers: new Headers(init?.headers),
				});
				return jsonResponse({ ok: true });
			},
		);
		const client = createClient("forwarding-key", undefined, {
			fetch: fetchMock,
		});

		await client.updateWorkout("workout-id", {} as never);
		await client.updateRoutine("routine-id", {} as never);
		await client.createRoutineFolder({} as never);
		await client.getRoutineFolder("folder-id");
		await client.createBodyMeasurement({} as never);
		await client.updateBodyMeasurement("2026-07-11", {} as never);

		expect(
			requests.map(({ url, method, body, headers }) => ({
				path: url.pathname,
				method,
				body,
				apiKey: headers.get("api-key"),
				contentType: headers.get("content-type"),
			})),
		).toEqual([
			{
				path: "/v1/workouts/workout-id",
				method: "PUT",
				body: "{}",
				apiKey: "forwarding-key",
				contentType: "application/json",
			},
			{
				path: "/v1/routines/routine-id",
				method: "PUT",
				body: "{}",
				apiKey: "forwarding-key",
				contentType: "application/json",
			},
			{
				path: "/v1/routine_folders",
				method: "POST",
				body: "{}",
				apiKey: "forwarding-key",
				contentType: "application/json",
			},
			{
				path: "/v1/routine_folders/folder-id",
				method: "GET",
				body: undefined,
				apiKey: "forwarding-key",
				contentType: null,
			},
			{
				path: "/v1/body_measurements",
				method: "POST",
				body: "{}",
				apiKey: "forwarding-key",
				contentType: "application/json",
			},
			{
				path: "/v1/body_measurements/2026-07-11",
				method: "PUT",
				body: "{}",
				apiKey: "forwarding-key",
				contentType: "application/json",
			},
		]);
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

	it("falls back to exponential backoff for invalid Retry-After values", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse({ error: "slow down" }, 429, {
					"retry-after": "not-a-date",
				}),
			)
			.mockResolvedValueOnce(jsonResponse({ ok: true }));
		const sleep = vi.fn().mockResolvedValue(undefined);
		const client = createClient("key", undefined, { fetch: fetchMock, sleep });

		await expect(client.getUserInfo()).resolves.toEqual({ ok: true });
		expect(sleep).toHaveBeenCalledWith(300);
	});

	it("maps public client helpers to the expected native requests", async () => {
		const fetchMock = vi.fn(
			async (_input: string | URL | Request, _init?: RequestInit) =>
				jsonResponse({}),
		);
		const client = createClient("key", undefined, { fetch: fetchMock });
		const cases: Array<{
			invoke: () => Promise<unknown>;
			method: string;
			path: string;
		}> = [
			{
				invoke: () => client.getWorkoutCount(),
				method: "GET",
				path: "/v1/workouts/count",
			},
			{
				invoke: () => client.getWorkoutEvents(),
				method: "GET",
				path: "/v1/workouts/events",
			},
			{
				invoke: () => client.getRoutines(),
				method: "GET",
				path: "/v1/routines",
			},
			{
				invoke: () => client.getRoutineById("routine-id"),
				method: "GET",
				path: "/v1/routines/routine-id",
			},
			{
				invoke: () => client.createRoutine({} as never),
				method: "POST",
				path: "/v1/routines",
			},
			{
				invoke: () => client.getExerciseTemplates(),
				method: "GET",
				path: "/v1/exercise_templates",
			},
			{
				invoke: () => client.getExerciseTemplate("template-id"),
				method: "GET",
				path: "/v1/exercise_templates/template-id",
			},
			{
				invoke: () => client.getExerciseHistory("template-id"),
				method: "GET",
				path: "/v1/exercise_history/template-id",
			},
			{
				invoke: () => client.createExerciseTemplate({} as never),
				method: "POST",
				path: "/v1/exercise_templates",
			},
			{
				invoke: () => client.getRoutineFolders(),
				method: "GET",
				path: "/v1/routine_folders",
			},
			{
				invoke: () => client.getBodyMeasurements(),
				method: "GET",
				path: "/v1/body_measurements",
			},
			{
				invoke: () => client.getBodyMeasurement("2026-07-11"),
				method: "GET",
				path: "/v1/body_measurements/2026-07-11",
			},
		];

		for (const testCase of cases) {
			fetchMock.mockClear();
			await testCase.invoke();
			const [input, init] = fetchMock.mock.calls[0] ?? [];
			const requestUrl =
				input instanceof Request
					? input.url
					: input instanceof URL
						? input.href
						: input;
			expect(new URL(requestUrl).pathname).toBe(testCase.path);
			expect(init?.method).toBe(testCase.method);
		}
	});

	it("rejects invalid endpoint overrides before making a request", async () => {
		const fetchMock = vi.fn();
		const client = createClient("key", undefined, {
			fetch: fetchMock,
			maxGetRetries: 0,
		});

		await expect(
			client.getUserInfo({ url: "/not-hevy" }),
		).rejects.toMatchObject({
			code: "HEVY_INVALID_ENDPOINT",
			endpoint: "unknown",
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("sends form data without JSON serialization", async () => {
		const formData = new FormData();
		formData.set("example", "value");
		const fetchMock = vi.fn(
			async (_input: string | URL | Request, init?: RequestInit) => {
				expect(init?.body).toBe(formData);
				expect(new Headers(init?.headers).has("content-type")).toBe(false);
				return jsonResponse({});
			},
		);
		const client = createClient("key", undefined, { fetch: fetchMock });

		await client.createWorkout(formData as never);
	});
});
