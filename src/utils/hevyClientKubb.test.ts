import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createClient,
	DEFAULT_API_TIMEOUT_MS,
	HEVY_RETRY_EXHAUSTED_ERROR_CODE,
	MAX_GET_RETRIES,
	RETRY_BACKOFF_BASE_MS,
} from "./hevyClientKubb";

type InternalKubbClient = {
	<TData = unknown>(config: Record<string, unknown>): Promise<{ data: TData }>;
	getConfig: () => unknown;
	setConfig: (config: unknown) => unknown;
};

type AxiosLikeError = Error & {
	code?: string;
	hevyRetryCount?: number;
	hevyRetryExhausted?: boolean;
	isAxiosError: true;
	response?: {
		headers?: unknown;
		status: number;
	};
};

const apiTestDoubles = vi.hoisted(() => ({
	lastClient: null as InternalKubbClient | null,
}));

const telemetryTestDoubles = vi.hoisted(() => {
	const store = {
		span: {
			setAttribute: vi.fn(),
			setStatus: vi.fn(),
			recordException: vi.fn(),
			end: vi.fn(),
		},
		requestHandler: undefined as
			| undefined
			| ((config: Record<string, unknown>) => Record<string, unknown>),
		responseSuccessHandler: undefined as
			| undefined
			| ((response: Record<string, unknown>) => Record<string, unknown>),
		responseErrorHandler: undefined as undefined | ((error: unknown) => never),
		tracerStartSpan: vi.fn(),
		apiCallsAdd: vi.fn(),
		apiDurationRecord: vi.fn(),
	};

	store.tracerStartSpan.mockReturnValue(store.span);

	return store;
});

const axiosTestDoubles = vi.hoisted(() => ({
	create: vi.fn(),
	request: vi.fn(),
}));

vi.mock("axios", () => ({
	default: {
		create: axiosTestDoubles.create,
	},
	isAxiosError: (error: unknown) =>
		Boolean((error as { isAxiosError?: boolean }).isAxiosError),
}));

vi.mock("./telemetry.js", () => ({
	tracer: {
		startSpan: telemetryTestDoubles.tracerStartSpan,
	},
}));

vi.mock("./metrics.js", () => ({
	apiCalls: { add: telemetryTestDoubles.apiCallsAdd },
	apiDuration: { record: telemetryTestDoubles.apiDurationRecord },
}));

vi.mock("@opentelemetry/api", () => ({
	SpanStatusCode: { OK: 1, ERROR: 2 },
}));

vi.mock("../generated/client/api", () => {
	function invokeClient(
		client: InternalKubbClient,
		config: Record<string, unknown>,
	): Promise<unknown> {
		apiTestDoubles.lastClient = client;
		return client(config).then((response) => response.data);
	}

	return {
		getV1Workouts: vi.fn(
			(
				headers: unknown,
				params: unknown,
				options: { client: InternalKubbClient },
			) =>
				invokeClient(options.client, {
					headers,
					method: "GET",
					params,
					url: "/v1/workouts",
				}),
		),
		getV1WorkoutsWorkoutid: vi.fn(
			(
				workoutId: string,
				headers: unknown,
				options: { client: InternalKubbClient },
			) =>
				invokeClient(options.client, {
					headers,
					method: "GET",
					url: `/v1/workouts/${workoutId}`,
				}),
		),
		getV1WorkoutsCount: vi.fn(
			(headers: unknown, options: { client: InternalKubbClient }) =>
				invokeClient(options.client, {
					headers,
					method: "GET",
					url: "/v1/workouts/count",
				}),
		),
		getV1Routines: vi.fn(
			(
				headers: unknown,
				params: unknown,
				options: { client: InternalKubbClient },
			) =>
				invokeClient(options.client, {
					headers,
					method: "GET",
					params,
					url: "/v1/routines",
				}),
		),
		getV1ExerciseTemplates: vi.fn(
			(
				headers: unknown,
				params: unknown,
				options: { client: InternalKubbClient },
			) =>
				invokeClient(options.client, {
					headers,
					method: "GET",
					params,
					url: "/v1/exercise-templates",
				}),
		),
		getV1UserInfo: vi.fn(
			(headers: unknown, options: { client: InternalKubbClient }) =>
				invokeClient(options.client, {
					headers,
					method: "GET",
					url: "/v1/user/info",
				}),
		),
		postV1Workouts: vi.fn(
			(
				data: unknown,
				headers: unknown,
				options: { client: InternalKubbClient },
			) =>
				invokeClient(options.client, {
					data,
					headers,
					method: "POST",
					url: "/v1/workouts",
				}),
		),
	};
});

function createAxiosError(options: {
	code?: string;
	headers?: unknown;
	message?: string;
	status?: number;
}): AxiosLikeError {
	const error = new Error(
		options.message ?? "Request failed",
	) as AxiosLikeError;
	error.isAxiosError = true;

	if (options.code) {
		error.code = options.code;
	}

	if (options.status !== undefined) {
		error.response = {
			status: options.status,
			headers: options.headers,
		};
	}

	return error;
}

function mockImmediateTimeouts(): number[] {
	const delays: number[] = [];
	vi.spyOn(globalThis, "setTimeout").mockImplementation(
		(callback: Parameters<typeof setTimeout>[0], delay?: number) => {
			delays.push(Number(delay ?? 0));
			if (typeof callback === "function") {
				callback();
			}
			return 0 as unknown as ReturnType<typeof setTimeout>;
		},
	);
	return delays;
}

describe("hevyClientKubb", () => {
	beforeEach(() => {
		delete process.env.HEVY_MCP_DEBUG;
		delete process.env.HEVY_MCP_API_TIMEOUT;
		apiTestDoubles.lastClient = null;
		vi.restoreAllMocks();
		vi.clearAllMocks();
		telemetryTestDoubles.requestHandler = undefined;
		telemetryTestDoubles.responseSuccessHandler = undefined;
		telemetryTestDoubles.responseErrorHandler = undefined;
		telemetryTestDoubles.tracerStartSpan.mockReturnValue(
			telemetryTestDoubles.span,
		);

		axiosTestDoubles.create.mockImplementation(
			(config: { baseURL?: string }) => ({
				request: axiosTestDoubles.request,
				defaults: {
					baseURL: config.baseURL,
				},
				interceptors: {
					request: {
						use: vi.fn(
							(handler: typeof telemetryTestDoubles.requestHandler) => {
								telemetryTestDoubles.requestHandler = handler ?? undefined;
								return 0;
							},
						),
					},
					response: {
						use: vi.fn(
							(
								onFulfilled: typeof telemetryTestDoubles.responseSuccessHandler,
								onRejected: typeof telemetryTestDoubles.responseErrorHandler,
							) => {
								telemetryTestDoubles.responseSuccessHandler =
									onFulfilled ?? undefined;
								telemetryTestDoubles.responseErrorHandler =
									onRejected ?? undefined;
								return 0;
							},
						),
					},
				},
			}),
		);
	});

	it("sets a default axios timeout of 30 seconds", () => {
		createClient("test-api-key");

		expect(axiosTestDoubles.create).toHaveBeenCalledWith(
			expect.objectContaining({
				timeout: DEFAULT_API_TIMEOUT_MS,
			}),
		);
	});

	it("allows HEVY_MCP_API_TIMEOUT to override the timeout", () => {
		process.env.HEVY_MCP_API_TIMEOUT = "45000";

		createClient("test-api-key");

		expect(axiosTestDoubles.create).toHaveBeenCalledWith(
			expect.objectContaining({
				timeout: 45_000,
			}),
		);
	});

	it("allows a client-specific timeout to override the default policy", () => {
		process.env.HEVY_MCP_API_TIMEOUT = "45000";

		createClient("test-api-key", undefined, { timeoutMs: 5_000 });

		expect(axiosTestDoubles.create).toHaveBeenCalledWith(
			expect.objectContaining({
				timeout: 5_000,
			}),
		);
	});

	it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 0.5])(
		"falls back to the configured timeout policy for invalid override %s",
		(timeoutMs) => {
			process.env.HEVY_MCP_API_TIMEOUT = "45000";

			createClient("test-api-key", undefined, { timeoutMs });

			expect(axiosTestDoubles.create).toHaveBeenCalledWith(
				expect.objectContaining({
					timeout: 45_000,
				}),
			);
		},
	);

	it("floors fractional client-specific timeouts", () => {
		createClient("test-api-key", undefined, { timeoutMs: 5_000.9 });

		expect(axiosTestDoubles.create).toHaveBeenCalledWith(
			expect.objectContaining({
				timeout: 5_000,
			}),
		);
	});

	it("falls back to the default timeout when HEVY_MCP_API_TIMEOUT is invalid", () => {
		process.env.HEVY_MCP_API_TIMEOUT = "not-a-number";

		createClient("test-api-key");

		expect(axiosTestDoubles.create).toHaveBeenCalledWith(
			expect.objectContaining({
				timeout: DEFAULT_API_TIMEOUT_MS,
			}),
		);
	});

	it("retries transient GET failures with exponential backoff", async () => {
		const delays = mockImmediateTimeouts();
		axiosTestDoubles.request
			.mockRejectedValueOnce(createAxiosError({ status: 500 }))
			.mockRejectedValueOnce(createAxiosError({ status: 502 }))
			.mockResolvedValueOnce({
				data: { ok: true },
				headers: {},
				status: 200,
				statusText: "OK",
			});

		const client = createClient("test-api-key");
		const response = await client.getWorkouts();

		expect(response).toEqual({ ok: true });
		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(3);
		expect(delays).toEqual([RETRY_BACKOFF_BASE_MS, RETRY_BACKOFF_BASE_MS * 2]);
	});

	it("allows retries to be disabled for a single client", async () => {
		const delays = mockImmediateTimeouts();
		axiosTestDoubles.request.mockRejectedValue(
			createAxiosError({ code: "ETIMEDOUT" }),
		);

		const client = createClient("test-api-key", undefined, {
			maxGetRetries: 0,
		});

		await expect(client.getUserInfo()).rejects.toMatchObject({
			code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
			hevyRetryCount: 0,
			hevyRetryExhausted: true,
			hevyRetryOriginalCode: "ETIMEDOUT",
		});
		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(1);
		expect(delays).toHaveLength(0);
	});

	it.each([Number.NaN, Number.POSITIVE_INFINITY])(
		"uses the default retry limit for non-finite override %s",
		async (maxGetRetries) => {
			const delays = mockImmediateTimeouts();
			axiosTestDoubles.request.mockRejectedValue(
				createAxiosError({ code: "ETIMEDOUT" }),
			);

			const client = createClient("test-api-key", undefined, {
				maxGetRetries,
			});

			await expect(client.getUserInfo()).rejects.toMatchObject({
				code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
				hevyRetryCount: MAX_GET_RETRIES,
				hevyRetryExhausted: true,
				hevyRetryOriginalCode: "ETIMEDOUT",
			});
			expect(axiosTestDoubles.request).toHaveBeenCalledTimes(
				MAX_GET_RETRIES + 1,
			);
			expect(delays).toHaveLength(MAX_GET_RETRIES);
		},
	);

	it("floors fractional retry overrides", async () => {
		const delays = mockImmediateTimeouts();
		axiosTestDoubles.request.mockRejectedValue(
			createAxiosError({ code: "ETIMEDOUT" }),
		);

		const client = createClient("test-api-key", undefined, {
			maxGetRetries: 1.9,
		});

		await expect(client.getUserInfo()).rejects.toMatchObject({
			code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
			hevyRetryCount: 1,
			hevyRetryExhausted: true,
		});
		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(2);
		expect(delays).toHaveLength(1);
	});

	it("emits an exact debug message for a retryable 503 GET failure", async () => {
		mockImmediateTimeouts();
		const logger = vi.fn();
		axiosTestDoubles.request
			.mockRejectedValueOnce(createAxiosError({ status: 503 }))
			.mockResolvedValueOnce({
				data: { ok: true },
				headers: {},
				status: 200,
				statusText: "OK",
			});

		const client = createClient("test-api-key", undefined, { logger });
		await client.getWorkouts();

		expect(logger).toHaveBeenCalledExactlyOnceWith({
			level: "debug",
			logger: "hevy-api",
			data: {
				message: "Retrying Hevy API request",
				status: 503,
				attempt: 2,
				maxAttempts: MAX_GET_RETRIES + 1,
				delayMs: RETRY_BACKOFF_BASE_MS,
				method: "GET",
				endpoint: "/v1/workouts",
			},
		});
	});

	it("redacts dynamic path values and query strings from log endpoints", async () => {
		mockImmediateTimeouts();
		const logger = vi.fn();
		axiosTestDoubles.request
			.mockRejectedValueOnce(createAxiosError({ status: 503 }))
			.mockResolvedValueOnce({
				data: { ok: true },
				headers: {},
				status: 200,
				statusText: "OK",
			});

		const client = createClient("test-api-key", undefined, { logger });
		await client.getWorkout("private-user-text?api-key=secret");

		expect(logger).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				data: expect.objectContaining({
					endpoint: "/v1/workouts/:workoutId",
				}),
			}),
		);
		expect(JSON.stringify(logger.mock.calls)).not.toContain(
			"private-user-text",
		);
		expect(JSON.stringify(logger.mock.calls)).not.toContain("secret");
	});

	it("retries transient timeout/network errors for GET requests", async () => {
		const delays = mockImmediateTimeouts();
		axiosTestDoubles.request
			.mockRejectedValueOnce(
				createAxiosError({
					code: "ECONNABORTED",
					message: "timeout of 30000ms exceeded",
				}),
			)
			.mockResolvedValueOnce({
				data: { ok: true },
				headers: {},
				status: 200,
				statusText: "OK",
			});

		const client = createClient("test-api-key");
		const response = await client.getWorkoutCount();

		expect(response).toEqual({ ok: true });
		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(2);
		expect(delays).toEqual([RETRY_BACKOFF_BASE_MS]);
	});

	it("respects Retry-After seconds for 429 retries", async () => {
		const delays = mockImmediateTimeouts();
		axiosTestDoubles.request
			.mockRejectedValueOnce(
				createAxiosError({
					headers: { "retry-after": "2" },
					status: 429,
				}),
			)
			.mockResolvedValueOnce({
				data: { ok: true },
				headers: {},
				status: 200,
				statusText: "OK",
			});

		const client = createClient("test-api-key");
		await client.getRoutines();

		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(2);
		expect(delays).toEqual([2_000]);
	});

	it("emits an exact warning message for a 429 retry", async () => {
		mockImmediateTimeouts();
		const logger = vi.fn();
		axiosTestDoubles.request
			.mockRejectedValueOnce(
				createAxiosError({
					headers: { "retry-after": "2" },
					status: 429,
				}),
			)
			.mockResolvedValueOnce({
				data: { ok: true },
				headers: {},
				status: 200,
				statusText: "OK",
			});

		const client = createClient("test-api-key", undefined, { logger });
		await client.getRoutines();

		expect(logger).toHaveBeenCalledExactlyOnceWith({
			level: "warning",
			logger: "hevy-api",
			data: {
				message: "Hevy API rate limit; retrying request",
				status: 429,
				attempt: 2,
				maxAttempts: MAX_GET_RETRIES + 1,
				delayMs: 2_000,
				retryAfterMs: 2_000,
				method: "GET",
				endpoint: "/v1/routines",
			},
		});
	});

	it("caps large Retry-After values to the bounded retry delay", async () => {
		const delays = mockImmediateTimeouts();
		axiosTestDoubles.request
			.mockRejectedValueOnce(
				createAxiosError({
					headers: { "retry-after": "86400" },
					status: 429,
				}),
			)
			.mockResolvedValueOnce({
				data: { ok: true },
				headers: {},
				status: 200,
				statusText: "OK",
			});

		const client = createClient("test-api-key");
		await client.getRoutines();

		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(2);
		expect(delays).toEqual([5_000]);
	});

	it("respects Retry-After HTTP-date for 429 retries", async () => {
		const delays = mockImmediateTimeouts();
		const now = 1_700_000_000_000;
		vi.spyOn(Date, "now").mockReturnValue(now);

		axiosTestDoubles.request
			.mockRejectedValueOnce(
				createAxiosError({
					headers: {
						"retry-after": new Date(now + 4_000).toUTCString(),
					},
					status: 429,
				}),
			)
			.mockResolvedValueOnce({
				data: { ok: true },
				headers: {},
				status: 200,
				statusText: "OK",
			});

		const client = createClient("test-api-key");
		await client.getExerciseTemplates();

		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(2);
		expect(delays).toEqual([4_000]);
	});

	it("reads Retry-After from headers.get and normalizes array values", async () => {
		const delays = mockImmediateTimeouts();
		axiosTestDoubles.request
			.mockRejectedValueOnce(
				createAxiosError({
					headers: {
						get: () => [4],
					},
					status: 429,
				}),
			)
			.mockResolvedValueOnce({
				data: { ok: true },
				headers: {},
				status: 200,
				statusText: "OK",
			});

		const client = createClient("test-api-key");
		await client.getWorkouts();

		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(2);
		expect(delays).toEqual([4_000]);
	});

	it("treats empty Retry-After arrays as missing", async () => {
		const delays = mockImmediateTimeouts();
		axiosTestDoubles.request
			.mockRejectedValueOnce(
				createAxiosError({
					headers: {
						get: () => [],
					},
					status: 429,
				}),
			)
			.mockResolvedValueOnce({
				data: { ok: true },
				headers: {},
				status: 200,
				statusText: "OK",
			});

		const client = createClient("test-api-key");
		await client.getWorkouts();

		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(2);
		expect(delays).toEqual([RETRY_BACKOFF_BASE_MS]);
	});

	it("falls back to exponential backoff for invalid Retry-After headers", async () => {
		const delays = mockImmediateTimeouts();
		axiosTestDoubles.request
			.mockRejectedValueOnce(
				createAxiosError({
					headers: { "retry-after": "not-a-date" },
					status: 429,
				}),
			)
			.mockResolvedValueOnce({
				data: { ok: true },
				headers: {},
				status: 200,
				statusText: "OK",
			});

		const client = createClient("test-api-key");
		await client.getRoutines();

		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(2);
		expect(delays).toEqual([RETRY_BACKOFF_BASE_MS]);
	});

	it("falls back to exponential backoff when Retry-After is missing", async () => {
		const delays = mockImmediateTimeouts();
		axiosTestDoubles.request
			.mockRejectedValueOnce(createAxiosError({ status: 429 }))
			.mockResolvedValueOnce({
				data: { ok: true },
				headers: {},
				status: 200,
				statusText: "OK",
			});

		const client = createClient("test-api-key");
		await client.getWorkoutCount();

		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(2);
		expect(delays).toEqual([RETRY_BACKOFF_BASE_MS]);
	});

	it("retries socket hang ups without relying on axios error codes", async () => {
		const delays = mockImmediateTimeouts();
		axiosTestDoubles.request
			.mockRejectedValueOnce(createAxiosError({ message: "socket hang up" }))
			.mockResolvedValueOnce({
				data: { ok: true },
				headers: {},
				status: 200,
				statusText: "OK",
			});

		const client = createClient("test-api-key");
		const response = await client.getUserInfo();

		expect(response).toEqual({ ok: true });
		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(2);
		expect(delays).toEqual([RETRY_BACKOFF_BASE_MS]);
	});

	it("does not retry canceled GET requests", async () => {
		const delays = mockImmediateTimeouts();
		axiosTestDoubles.request.mockRejectedValueOnce(
			createAxiosError({ code: "ERR_CANCELED", message: "canceled" }),
		);

		const client = createClient("test-api-key");

		await expect(client.getWorkouts()).rejects.toBeDefined();

		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(1);
		expect(delays).toHaveLength(0);
	});

	it("does not retry non-retryable HTTP errors for GET requests", async () => {
		const delays = mockImmediateTimeouts();
		axiosTestDoubles.request.mockRejectedValueOnce(
			createAxiosError({ status: 400 }),
		);

		const client = createClient("test-api-key");

		await expect(client.getRoutines()).rejects.toBeDefined();

		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(1);
		expect(delays).toHaveLength(0);
	});

	it("emits an exact error message for a non-retryable API failure", async () => {
		mockImmediateTimeouts();
		const logger = vi.fn();
		axiosTestDoubles.request.mockRejectedValueOnce(
			createAxiosError({ status: 400 }),
		);

		const client = createClient("test-api-key", undefined, { logger });

		await expect(client.getRoutines()).rejects.toBeDefined();
		expect(logger).toHaveBeenCalledExactlyOnceWith({
			level: "error",
			logger: "hevy-api",
			data: {
				message: "Hevy API request failed without retry",
				status: 400,
				method: "GET",
				endpoint: "/v1/routines",
			},
		});
	});

	it("keeps retries bounded and annotates exhausted retry errors", async () => {
		const delays = mockImmediateTimeouts();
		axiosTestDoubles.request.mockImplementation(() => {
			throw createAxiosError({ code: "ETIMEDOUT", status: 503 });
		});

		const client = createClient("test-api-key");

		await expect(client.getUserInfo()).rejects.toMatchObject({
			code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
			hevyRetryCount: MAX_GET_RETRIES,
			hevyRetryExhausted: true,
			hevyRetryOriginalCode: "ETIMEDOUT",
		});

		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(MAX_GET_RETRIES + 1);
		expect(delays).toHaveLength(MAX_GET_RETRIES);
	});

	it("emits one terminal error after non-429 retry exhaustion", async () => {
		mockImmediateTimeouts();
		const logger = vi.fn();
		axiosTestDoubles.request.mockRejectedValue(
			createAxiosError({ status: 503 }),
		);

		const client = createClient("test-api-key", undefined, { logger });

		await expect(client.getUserInfo()).rejects.toBeDefined();

		const terminalMessages = logger.mock.calls
			.map(([entry]) => entry)
			.filter(
				(entry) =>
					(entry as { data?: { message?: string } }).data?.message ===
					"Hevy API request failed after retries",
			);
		expect(terminalMessages).toEqual([
			{
				level: "error",
				logger: "hevy-api",
				data: {
					message: "Hevy API request failed after retries",
					status: 503,
					attempt: MAX_GET_RETRIES + 1,
					maxAttempts: MAX_GET_RETRIES + 1,
					method: "GET",
					endpoint: "/v1/user/info",
				},
			},
		]);
	});

	it("uses warning severity for terminal 429 exhaustion", async () => {
		mockImmediateTimeouts();
		const logger = vi.fn();
		axiosTestDoubles.request.mockRejectedValue(
			createAxiosError({ status: 429 }),
		);

		const client = createClient("test-api-key", undefined, { logger });

		await expect(client.getWorkouts()).rejects.toBeDefined();

		expect(logger).toHaveBeenLastCalledWith({
			level: "warning",
			logger: "hevy-api",
			data: {
				message: "Hevy API request failed after retries",
				status: 429,
				attempt: MAX_GET_RETRIES + 1,
				maxAttempts: MAX_GET_RETRIES + 1,
				method: "GET",
				endpoint: "/v1/workouts",
			},
		});
	});

	it("does not let a throwing logger change retry results", async () => {
		mockImmediateTimeouts();
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const logger = vi.fn(() => {
			throw new Error("logger failed");
		});
		axiosTestDoubles.request
			.mockRejectedValueOnce(createAxiosError({ status: 503 }))
			.mockResolvedValueOnce({
				data: { ok: true },
				headers: {},
				status: 200,
				statusText: "OK",
			});

		const client = createClient("test-api-key", undefined, { logger });

		await expect(client.getWorkouts()).resolves.toEqual({ ok: true });
		expect(errorSpy).toHaveBeenCalledWith(
			"Failed to emit structured Hevy API log",
			expect.any(Error),
		);
	});

	it("rethrows non-axios errors without retrying", async () => {
		const delays = mockImmediateTimeouts();
		axiosTestDoubles.request.mockImplementation(() => {
			throw new Error("boom");
		});

		const client = createClient("test-api-key");

		await expect(client.getWorkouts()).rejects.toThrow("boom");

		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(1);
		expect(delays).toHaveLength(0);
	});

	it("does not retry non-idempotent POST requests", async () => {
		const delays = mockImmediateTimeouts();
		axiosTestDoubles.request.mockRejectedValueOnce(
			createAxiosError({ status: 503 }),
		);

		const client = createClient("test-api-key");

		await expect(client.createWorkout({} as never)).rejects.toBeDefined();

		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(1);
		expect(delays).toHaveLength(0);
	});

	it("lets generated callers update the resilient client config", async () => {
		axiosTestDoubles.request.mockResolvedValueOnce({
			data: { ok: true },
			headers: {},
			status: 200,
			statusText: "OK",
		});

		const client = createClient("test-api-key", "https://api.example.com");
		await client.getWorkouts();

		expect(apiTestDoubles.lastClient).not.toBeNull();
		if (!apiTestDoubles.lastClient) {
			throw new Error(
				"Expected generated API call to capture the internal client",
			);
		}

		expect(apiTestDoubles.lastClient.getConfig()).toEqual({
			baseURL: "https://api.example.com",
		});

		const updatedConfig = apiTestDoubles.lastClient.setConfig({
			baseURL: "https://mirror.example.com",
		} as never);

		expect(updatedConfig).toEqual({
			baseURL: "https://mirror.example.com",
		});
		expect(
			axiosTestDoubles.create.mock.results[0]?.value.defaults.baseURL,
		).toBe("https://mirror.example.com");
	});

	it("attaches tracing metadata and records successful API responses", () => {
		createClient("test-api-key", "https://api.hevyapp.com");
		const dateNow = vi.spyOn(Date, "now");
		dateNow.mockReturnValueOnce(1_000).mockReturnValueOnce(1_125);

		const config = telemetryTestDoubles.requestHandler?.({
			method: "post",
			url: "/v1/workouts",
			baseURL: "https://api.hevyapp.com",
		});

		expect(config).toMatchObject({
			_span: telemetryTestDoubles.span,
			_startTime: 1_000,
		});
		expect(telemetryTestDoubles.tracerStartSpan).toHaveBeenCalledWith(
			"hevy.api.POST",
			{
				attributes: {
					"http.method": "POST",
					"http.url": "/v1/workouts",
					"http.base_url": "https://api.hevyapp.com",
					"hevy.api.endpoint": "/v1/workouts",
				},
			},
		);

		const response = {
			status: 201,
			config,
		};

		expect(telemetryTestDoubles.responseSuccessHandler?.(response)).toBe(
			response,
		);
		expect(telemetryTestDoubles.span.setAttribute).toHaveBeenCalledWith(
			"http.status_code",
			201,
		);
		expect(telemetryTestDoubles.span.setAttribute).toHaveBeenCalledWith(
			"http.response.duration_ms",
			125,
		);
		expect(telemetryTestDoubles.span.setStatus).toHaveBeenCalledWith({
			code: 1,
		});
		expect(telemetryTestDoubles.span.end).toHaveBeenCalled();
		expect(telemetryTestDoubles.apiCallsAdd).toHaveBeenCalledWith(1, {
			method: "POST",
			endpoint: "/v1/workouts",
			status_code: 201,
		});
		expect(telemetryTestDoubles.apiDurationRecord).toHaveBeenCalledWith(125, {
			method: "POST",
			endpoint: "/v1/workouts",
		});
	});

	it("records failed API responses and rethrows the original error", () => {
		createClient("test-api-key", "https://api.hevyapp.com");
		const dateNow = vi.spyOn(Date, "now");
		dateNow.mockReturnValueOnce(2_000).mockReturnValueOnce(2_050);

		const config = telemetryTestDoubles.requestHandler?.({
			method: "get",
			url: "/v1/routines",
			baseURL: "https://api.hevyapp.com",
		});
		const error = new Error("request failed") as Error & {
			config?: Record<string, unknown>;
			response?: { status: number };
		};
		error.config = config;
		error.response = { status: 503 };

		let thrown: unknown;
		try {
			telemetryTestDoubles.responseErrorHandler?.(error);
		} catch (caught) {
			thrown = caught;
		}

		expect(thrown).toBe(error);
		expect(telemetryTestDoubles.span.setAttribute).toHaveBeenCalledWith(
			"http.status_code",
			503,
		);
		expect(telemetryTestDoubles.span.setStatus).toHaveBeenCalledWith({
			code: 2,
		});
		expect(telemetryTestDoubles.span.recordException).toHaveBeenCalledWith(
			error,
		);
		expect(telemetryTestDoubles.span.end).toHaveBeenCalled();
		expect(telemetryTestDoubles.apiCallsAdd).toHaveBeenCalledWith(1, {
			method: "GET",
			endpoint: "/v1/routines",
			status_code: 503,
		});
		expect(telemetryTestDoubles.apiDurationRecord).toHaveBeenCalledWith(50, {
			method: "GET",
			endpoint: "/v1/routines",
		});
	});

	it("writes sanitized successful API diagnostics to stderr", () => {
		process.env.HEVY_MCP_DEBUG = "1";
		const stderrSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);
		const stdoutSpy = vi
			.spyOn(process.stdout, "write")
			.mockImplementation(() => true);
		const logger = vi.fn();
		createClient("test-api-key", "https://api.hevyapp.com", { logger });
		const dateNow = vi.spyOn(Date, "now");
		dateNow.mockReturnValueOnce(5_000).mockReturnValueOnce(5_075);

		const config = telemetryTestDoubles.requestHandler?.({
			method: "get",
			url: "/v1/workouts/private-id?api-key=secret&query=private-text",
			baseURL: "https://api.hevyapp.com",
		});
		telemetryTestDoubles.responseSuccessHandler?.({ status: 200, config });

		const output = String(stderrSpy.mock.calls[0]?.[0]);
		expect(output).toContain('"event":"api_response"');
		expect(output).toContain('"method":"GET"');
		expect(output).toContain('"endpoint":"/v1/workouts/:workoutId"');
		expect(output).toContain('"durationMs":75');
		expect(output).toContain('"status":200');
		expect(output).not.toContain("private-id");
		expect(output).not.toContain("secret");
		expect(output).not.toContain("private-text");
		expect(stdoutSpy).not.toHaveBeenCalled();
		expect(logger).not.toHaveBeenCalled();
	});

	it.each([
		{ status: 503, expectedStatus: "503" },
		{ status: undefined, expectedStatus: "null" },
	])(
		"writes sanitized failed API diagnostics with status $expectedStatus",
		({ status, expectedStatus }) => {
			process.env.HEVY_MCP_DEBUG = "1";
			const stderrSpy = vi
				.spyOn(process.stderr, "write")
				.mockImplementation(() => true);
			const stdoutSpy = vi
				.spyOn(process.stdout, "write")
				.mockImplementation(() => true);
			createClient("test-api-key", "https://api.hevyapp.com");
			const dateNow = vi.spyOn(Date, "now");
			dateNow.mockReturnValueOnce(6_000).mockReturnValueOnce(6_040);

			const config = telemetryTestDoubles.requestHandler?.({
				method: "put",
				url: "/v1/routines/private-id?token=secret",
				baseURL: "https://api.hevyapp.com",
			});
			const error = new Error("must not be logged") as Error & {
				config?: Record<string, unknown>;
				response?: { status: number };
			};
			error.config = config;
			if (status !== undefined) {
				error.response = { status };
			}

			expect(() => telemetryTestDoubles.responseErrorHandler?.(error)).toThrow(
				error,
			);
			const output = String(stderrSpy.mock.calls[0]?.[0]);
			expect(output).toContain('"event":"api_response"');
			expect(output).toContain('"method":"PUT"');
			expect(output).toContain('"endpoint":"/v1/routines/:routineId"');
			expect(output).toContain('"durationMs":40');
			expect(output).toContain(`"status":${expectedStatus}`);
			expect(output).not.toContain("private-id");
			expect(output).not.toContain("secret");
			expect(output).not.toContain("must not be logged");
			expect(stdoutSpy).not.toHaveBeenCalled();
		},
	);

	it("keeps API diagnostics silent when debug mode is disabled", () => {
		const stderrSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);
		createClient("test-api-key", "https://api.hevyapp.com");
		vi.spyOn(Date, "now").mockReturnValue(7_000);
		const config = telemetryTestDoubles.requestHandler?.({
			method: "get",
			url: "/v1/workouts",
		});

		telemetryTestDoubles.responseSuccessHandler?.({ status: 200, config });

		expect(stderrSpy).not.toHaveBeenCalled();
	});

	it("defaults request tracing metadata when the axios config is sparse", () => {
		createClient("test-api-key", "https://api.hevyapp.com");
		vi.spyOn(Date, "now").mockReturnValue(4_000);

		const config = telemetryTestDoubles.requestHandler?.({});

		expect(config).toMatchObject({
			_span: telemetryTestDoubles.span,
			_startTime: 4_000,
		});
		expect(telemetryTestDoubles.tracerStartSpan).toHaveBeenCalledWith(
			"hevy.api.GET",
			{
				attributes: {
					"http.method": "GET",
					"http.url": "",
					"http.base_url": "",
					"hevy.api.endpoint": "",
				},
			},
		);
	});

	it("falls back to default error metrics when axios error metadata is missing", () => {
		createClient("test-api-key", "https://api.hevyapp.com");
		const dateNow = vi.spyOn(Date, "now");
		dateNow.mockReturnValueOnce(3_000).mockReturnValueOnce(3_040);
		const error = new Error("missing metadata");

		let thrown: unknown;
		try {
			telemetryTestDoubles.responseErrorHandler?.(error);
		} catch (caught) {
			thrown = caught;
		}

		expect(thrown).toBe(error);
		expect(telemetryTestDoubles.span.setAttribute).not.toHaveBeenCalled();
		expect(telemetryTestDoubles.apiCallsAdd).toHaveBeenCalledWith(1, {
			method: "GET",
			endpoint: "",
			status_code: 0,
		});
		expect(telemetryTestDoubles.apiDurationRecord).toHaveBeenCalledWith(0, {
			method: "GET",
			endpoint: "",
		});
	});
});
