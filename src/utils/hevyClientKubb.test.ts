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
					url: "/v1/user-info",
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
		delete process.env.HEVY_MCP_API_TIMEOUT;
		apiTestDoubles.lastClient = null;
		vi.restoreAllMocks();
		vi.clearAllMocks();

		axiosTestDoubles.create.mockImplementation(
			(config: { baseURL?: string }) => ({
				request: axiosTestDoubles.request,
				defaults: {
					baseURL: config.baseURL,
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
});
