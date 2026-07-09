import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createClient,
	DEFAULT_API_TIMEOUT_MS,
	HEVY_RETRY_EXHAUSTED_ERROR_CODE,
	MAX_GET_RETRIES,
	RETRY_BACKOFF_BASE_MS,
} from "./hevyClientKubb";

type AxiosLikeError = Error & {
	code?: string;
	hevyRetryCount?: number;
	hevyRetryExhausted?: boolean;
	isAxiosError: true;
	response?: {
		headers?: Record<string, string>;
		status: number;
	};
};

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

function createAxiosError(options: {
	code?: string;
	headers?: Record<string, string>;
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
		vi.restoreAllMocks();
		vi.clearAllMocks();

		axiosTestDoubles.create.mockReturnValue({
			request: axiosTestDoubles.request,
			defaults: {},
		});
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

	it("keeps retries bounded and annotates exhausted retry errors", async () => {
		const delays = mockImmediateTimeouts();
		axiosTestDoubles.request.mockImplementation(() => {
			throw createAxiosError({ status: 503 });
		});

		const client = createClient("test-api-key");

		await expect(client.getUserInfo()).rejects.toMatchObject({
			code: HEVY_RETRY_EXHAUSTED_ERROR_CODE,
			hevyRetryCount: MAX_GET_RETRIES,
			hevyRetryExhausted: true,
		});

		expect(axiosTestDoubles.request).toHaveBeenCalledTimes(MAX_GET_RETRIES + 1);
		expect(delays).toHaveLength(MAX_GET_RETRIES);
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
});
