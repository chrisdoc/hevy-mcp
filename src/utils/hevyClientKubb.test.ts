import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "./hevyClientKubb";

const testDoubles = vi.hoisted(() => {
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
		axiosCreate: vi.fn(),
	};

	store.tracerStartSpan.mockReturnValue(store.span);

	const axiosInstance = {
		interceptors: {
			request: {
				use: vi.fn((handler: typeof store.requestHandler) => {
					store.requestHandler = handler ?? undefined;
					return 0;
				}),
			},
			response: {
				use: vi.fn(
					(
						onFulfilled: typeof store.responseSuccessHandler,
						onRejected: typeof store.responseErrorHandler,
					) => {
						store.responseSuccessHandler = onFulfilled ?? undefined;
						store.responseErrorHandler = onRejected ?? undefined;
						return 0;
					},
				),
			},
		},
	};

	store.axiosCreate.mockReturnValue(axiosInstance);

	return store;
});

vi.mock("axios", () => ({
	default: {
		create: testDoubles.axiosCreate,
	},
}));

vi.mock("./telemetry.js", () => ({
	tracer: {
		startSpan: testDoubles.tracerStartSpan,
	},
}));

vi.mock("./metrics.js", () => ({
	apiCalls: { add: testDoubles.apiCallsAdd },
	apiDuration: { record: testDoubles.apiDurationRecord },
}));

vi.mock("@opentelemetry/api", () => ({
	SpanStatusCode: { OK: 1, ERROR: 2 },
}));

vi.mock("../generated/client/api", () => ({}));

describe("hevyClientKubb", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		testDoubles.requestHandler = undefined;
		testDoubles.responseSuccessHandler = undefined;
		testDoubles.responseErrorHandler = undefined;
		testDoubles.tracerStartSpan.mockReturnValue(testDoubles.span);
		testDoubles.axiosCreate.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("attaches tracing metadata and records successful API responses", () => {
		createClient("test-api-key", "https://api.hevyapp.com");
		const dateNow = vi.spyOn(Date, "now");
		dateNow.mockReturnValueOnce(1_000).mockReturnValueOnce(1_125);

		const config = testDoubles.requestHandler?.({
			method: "post",
			url: "/v1/workouts",
			baseURL: "https://api.hevyapp.com",
		});

		expect(config).toMatchObject({
			_span: testDoubles.span,
			_startTime: 1_000,
		});
		expect(testDoubles.tracerStartSpan).toHaveBeenCalledWith("hevy.api.POST", {
			attributes: {
				"http.method": "POST",
				"http.url": "/v1/workouts",
				"http.base_url": "https://api.hevyapp.com",
				"hevy.api.endpoint": "/v1/workouts",
			},
		});

		const response = {
			status: 201,
			config,
		};

		expect(testDoubles.responseSuccessHandler?.(response)).toBe(response);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"http.status_code",
			201,
		);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"http.response.duration_ms",
			125,
		);
		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({ code: 1 });
		expect(testDoubles.span.end).toHaveBeenCalled();
		expect(testDoubles.apiCallsAdd).toHaveBeenCalledWith(1, {
			method: "POST",
			endpoint: "/v1/workouts",
			status_code: 201,
		});
		expect(testDoubles.apiDurationRecord).toHaveBeenCalledWith(125, {
			method: "POST",
			endpoint: "/v1/workouts",
		});
	});

	it("records failed API responses and rethrows the original error", () => {
		createClient("test-api-key", "https://api.hevyapp.com");
		const dateNow = vi.spyOn(Date, "now");
		dateNow.mockReturnValueOnce(2_000).mockReturnValueOnce(2_050);

		const config = testDoubles.requestHandler?.({
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
			testDoubles.responseErrorHandler?.(error);
		} catch (caught) {
			thrown = caught;
		}

		expect(thrown).toBe(error);
		expect(testDoubles.span.setAttribute).toHaveBeenCalledWith(
			"http.status_code",
			503,
		);
		expect(testDoubles.span.setStatus).toHaveBeenCalledWith({ code: 2 });
		expect(testDoubles.span.recordException).toHaveBeenCalledWith(error);
		expect(testDoubles.span.end).toHaveBeenCalled();
		expect(testDoubles.apiCallsAdd).toHaveBeenCalledWith(1, {
			method: "GET",
			endpoint: "/v1/routines",
			status_code: 503,
		});
		expect(testDoubles.apiDurationRecord).toHaveBeenCalledWith(50, {
			method: "GET",
			endpoint: "/v1/routines",
		});
	});

	it("defaults request tracing metadata when the axios config is sparse", () => {
		createClient("test-api-key", "https://api.hevyapp.com");
		vi.spyOn(Date, "now").mockReturnValue(4_000);

		const config = testDoubles.requestHandler?.({});

		expect(config).toMatchObject({
			_span: testDoubles.span,
			_startTime: 4_000,
		});
		expect(testDoubles.tracerStartSpan).toHaveBeenCalledWith("hevy.api.GET", {
			attributes: {
				"http.method": "GET",
				"http.url": "",
				"http.base_url": "",
				"hevy.api.endpoint": "",
			},
		});
	});

	it("falls back to default error metrics when axios error metadata is missing", () => {
		createClient("test-api-key", "https://api.hevyapp.com");
		const dateNow = vi.spyOn(Date, "now");
		dateNow.mockReturnValueOnce(3_000).mockReturnValueOnce(3_040);
		const error = new Error("missing metadata");

		let thrown: unknown;
		try {
			testDoubles.responseErrorHandler?.(error);
		} catch (caught) {
			thrown = caught;
		}

		expect(thrown).toBe(error);
		expect(testDoubles.span.setAttribute).not.toHaveBeenCalled();
		expect(testDoubles.apiCallsAdd).toHaveBeenCalledWith(1, {
			method: "GET",
			endpoint: "",
			status_code: 0,
		});
		// When no _startTime is available (missing config), duration falls back to 0
		expect(testDoubles.apiDurationRecord).toHaveBeenCalledWith(0, {
			method: "GET",
			endpoint: "",
		});
	});
});
