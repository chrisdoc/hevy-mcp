import type {
	RequestConfig,
	ResponseConfig,
} from "../generated/.kubb/fetch.ts";
import { SpanStatusCode, type Span } from "@opentelemetry/api";
import axios, {
	isAxiosError,
	type AxiosError,
	type AxiosInstance,
	type AxiosRequestConfig,
	type InternalAxiosRequestConfig,
} from "axios";
import * as api from "../generated/client/api";
import type {
	McpClientLogger,
	McpClientLogMessage,
} from "./mcp-client-logger.js";
import { debugLog } from "./debug.js";
import { tracer } from "./telemetry.js";
import { apiCalls, apiDuration } from "./metrics.js";
import type {
	GetV1BodyMeasurementsQueryParams,
	GetV1ExerciseHistoryExercisetemplateidQueryParams,
	GetV1ExerciseTemplatesQueryParams,
	GetV1RoutineFoldersQueryParams,
	GetV1RoutinesQueryParams,
	GetV1WorkoutsEventsQueryParams,
	GetV1WorkoutsQueryParams,
	PostV1BodyMeasurementsMutationRequest,
	PostV1ExerciseTemplatesMutationRequest,
	PostV1RoutineFoldersMutationRequest,
	PostV1RoutinesMutationRequest,
	PostV1WorkoutsMutationRequest,
	PutV1BodyMeasurementsDateMutationRequest,
	PutV1RoutinesRoutineidMutationRequest,
	PutV1WorkoutsWorkoutidMutationRequest,
} from "../generated/client/types";

// Define a proper client type that matches the Kubb client interface
type KubbClient = {
	<TData, _TError = unknown, TVariables = unknown>(
		config: RequestConfig<TVariables>,
	): Promise<ResponseConfig<TData>>;
	getConfig: () => Partial<RequestConfig<unknown>>;
	setConfig: (config: RequestConfig) => Partial<RequestConfig<unknown>>;
};

/**
 * Type-safe wrapper helper that enforces parameter types match the generated API.
 * This prevents arg-order regressions by using Parameters<> to extract expected types.
 *
 * Usage: wrapApi(api.postV1ExerciseTemplates)(data, headers, { client })
 * TypeScript will error if arguments don't match the generated signature.
 */
function wrapApi<T extends (...args: Parameters<T>) => ReturnType<T>>(
	fn: T,
): (...args: Parameters<T>) => ReturnType<T> {
	return fn;
}

export const DEFAULT_API_TIMEOUT_MS = 30_000;
export const MAX_GET_RETRIES = 3;
export const RETRY_BACKOFF_BASE_MS = 300;
const RETRY_BACKOFF_MAX_MS = 5_000;

export const HEVY_RETRY_EXHAUSTED_ERROR_CODE = "HEVY_RETRY_EXHAUSTED";

export interface HevyClientOptions {
	logger?: McpClientLogger;
}

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

const RETRYABLE_NETWORK_ERROR_CODES = new Set([
	"ECONNABORTED",
	"ECONNREFUSED",
	"ECONNRESET",
	"EAI_AGAIN",
	"ENETUNREACH",
	"ENOTFOUND",
	"ERR_NETWORK",
	"ERR_SOCKET_TIMEOUT",
	"ETIMEDOUT",
]);

const SAFE_STATIC_ENDPOINTS = new Set([
	"/v1/body_measurements",
	"/v1/exercise_templates",
	"/v1/routine_folders",
	"/v1/routines",
	"/v1/user/info",
	"/v1/workouts",
	"/v1/workouts/count",
	"/v1/workouts/events",
]);

const SAFE_DYNAMIC_ENDPOINTS = [
	["/v1/body_measurements/", "/v1/body_measurements/:date"],
	["/v1/exercise_history/", "/v1/exercise_history/:exerciseTemplateId"],
	["/v1/exercise_templates/", "/v1/exercise_templates/:exerciseTemplateId"],
	["/v1/routine_folders/", "/v1/routine_folders/:folderId"],
	["/v1/routines/", "/v1/routines/:routineId"],
	["/v1/workouts/", "/v1/workouts/:workoutId"],
] as const;

type RetryAwareAxiosError = AxiosError & {
	hevyRetryCount?: number;
	hevyRetryExhausted?: boolean;
	hevyRetryStatus?: number;
	hevyRetryOriginalCode?: string;
};

function getApiTimeoutMs(): number {
	const rawValue = process.env.HEVY_MCP_API_TIMEOUT;
	if (!rawValue) {
		return DEFAULT_API_TIMEOUT_MS;
	}

	const parsed = Number(rawValue);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return DEFAULT_API_TIMEOUT_MS;
	}

	return Math.trunc(parsed);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function isGetRequest(config: RequestConfig<unknown>): boolean {
	return config.method?.toUpperCase() === "GET";
}

function isRetryableStatus(status: number | undefined): boolean {
	if (status === undefined) {
		return false;
	}

	return RETRYABLE_STATUS_CODES.has(status);
}

function isTransientNetworkError(error: AxiosError): boolean {
	if (error.code === "ERR_CANCELED") {
		return false;
	}

	if (error.code && RETRYABLE_NETWORK_ERROR_CODES.has(error.code)) {
		return true;
	}

	if (error.response) {
		return false;
	}

	const message = error.message.toLowerCase();
	return (
		message.includes("network") ||
		message.includes("socket hang up") ||
		message.includes("timeout")
	);
}

function normalizeHeaderValue(value: unknown): string | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}

	if (Array.isArray(value) && value.length > 0) {
		return normalizeHeaderValue(value[0]);
	}

	return undefined;
}

function getHeaderValue(headers: unknown, key: string): string | undefined {
	if (!headers || typeof headers !== "object") {
		return undefined;
	}

	if (
		"get" in headers &&
		typeof (headers as { get?: unknown }).get === "function"
	) {
		const value = (
			headers as {
				get: (headerName: string) => unknown;
			}
		).get(key);
		return normalizeHeaderValue(value);
	}

	const headerRecord = headers as Record<string, unknown>;
	return normalizeHeaderValue(
		headerRecord[key] ??
			headerRecord[key.toLowerCase()] ??
			headerRecord[key.toUpperCase()],
	);
}

function parseRetryAfterMs(value: string): number | undefined {
	const numericSeconds = Number(value);
	if (Number.isFinite(numericSeconds) && numericSeconds >= 0) {
		return Math.min(RETRY_BACKOFF_MAX_MS, Math.round(numericSeconds * 1000));
	}

	const dateMillis = Date.parse(value);
	if (Number.isNaN(dateMillis)) {
		return undefined;
	}

	return Math.min(RETRY_BACKOFF_MAX_MS, Math.max(0, dateMillis - Date.now()));
}

function getRetryAfterDelayMs(error: AxiosError): number | undefined {
	if (error.response?.status !== 429) {
		return undefined;
	}

	const retryAfterHeader = getHeaderValue(
		error.response.headers,
		"retry-after",
	);
	if (!retryAfterHeader) {
		return undefined;
	}

	return parseRetryAfterMs(retryAfterHeader);
}

function getExponentialBackoffMs(retryAttempt: number): number {
	const exponent = Math.max(0, retryAttempt - 1);
	const delay = RETRY_BACKOFF_BASE_MS * 2 ** exponent;
	return Math.min(RETRY_BACKOFF_MAX_MS, delay);
}

function getRetryDelayMs(error: AxiosError, retryAttempt: number): number {
	const exponentialDelay = getExponentialBackoffMs(retryAttempt);
	const retryAfterDelay = getRetryAfterDelayMs(error);

	if (retryAfterDelay === undefined) {
		return exponentialDelay;
	}

	return Math.min(
		RETRY_BACKOFF_MAX_MS,
		Math.max(exponentialDelay, retryAfterDelay),
	);
}

function shouldRetryRequest(
	config: RequestConfig<unknown>,
	error: AxiosError,
): boolean {
	if (!isGetRequest(config)) {
		return false;
	}

	return (
		isRetryableStatus(error.response?.status) || isTransientNetworkError(error)
	);
}

function getRequestContext(config: { method?: string; url?: string }) {
	const method = (config.method ?? "GET").toUpperCase();
	const url = config.url ?? "";
	const rawEndpoint = url.split("?")[0] ?? url;

	let endpoint = "unknown";
	if (SAFE_STATIC_ENDPOINTS.has(rawEndpoint)) {
		endpoint = rawEndpoint;
	} else {
		endpoint =
			SAFE_DYNAMIC_ENDPOINTS.find(([prefix]) =>
				rawEndpoint.startsWith(prefix),
			)?.[1] ?? "unknown";
	}
	return { method, endpoint };
}

function emitClientLog(
	logger: McpClientLogger | undefined,
	message: McpClientLogMessage,
): void {
	try {
		logger?.(message);
	} catch (error) {
		console.error("Failed to emit structured Hevy API log", error);
	}
}

function markRetryExhausted(error: AxiosError, retryCount: number): void {
	const retryError = error as RetryAwareAxiosError;
	retryError.hevyRetryExhausted = true;
	retryError.hevyRetryCount = retryCount;
	retryError.hevyRetryStatus = error.response?.status;

	if (retryError.code) {
		retryError.hevyRetryOriginalCode = retryError.code;
	}

	retryError.code = HEVY_RETRY_EXHAUSTED_ERROR_CODE;
}

async function requestWithRetries<TData, TVariables>(
	axiosInstance: AxiosInstance,
	config: RequestConfig<TVariables>,
	logger?: McpClientLogger,
): Promise<ResponseConfig<TData>> {
	let retryCount = 0;

	while (true) {
		try {
			return await axiosInstance.request<
				TData,
				ResponseConfig<TData>,
				TVariables
			>(config as AxiosRequestConfig<TVariables>);
		} catch (error) {
			if (!isAxiosError(error)) {
				throw error;
			}

			const normalizedConfig = config as RequestConfig<unknown>;
			const { method, endpoint } = getRequestContext(normalizedConfig);
			const status = error.response?.status ?? null;
			if (!shouldRetryRequest(normalizedConfig, error)) {
				emitClientLog(logger, {
					level: "error",
					logger: "hevy-api",
					data: {
						message: "Hevy API request failed without retry",
						status,
						method,
						endpoint,
					},
				});
				throw error;
			}

			if (retryCount >= MAX_GET_RETRIES) {
				emitClientLog(logger, {
					level: status === 429 ? "warning" : "error",
					logger: "hevy-api",
					data: {
						message: "Hevy API request failed after retries",
						status,
						attempt: retryCount + 1,
						maxAttempts: MAX_GET_RETRIES + 1,
						method,
						endpoint,
					},
				});
				markRetryExhausted(error, retryCount);
				throw error;
			}

			retryCount += 1;
			const retryDelayMs = getRetryDelayMs(error, retryCount);
			const retryAfterMs = getRetryAfterDelayMs(error);
			emitClientLog(logger, {
				level: status === 429 ? "warning" : "debug",
				logger: "hevy-api",
				data: {
					message:
						status === 429
							? "Hevy API rate limit; retrying request"
							: "Retrying Hevy API request",
					status,
					attempt: retryCount + 1,
					maxAttempts: MAX_GET_RETRIES + 1,
					delayMs: retryDelayMs,
					...(status === 429 ? { retryAfterMs: retryAfterMs ?? null } : {}),
					method,
					endpoint,
				},
			});
			await sleep(retryDelayMs);
		}
	}
}

function createResilientClient(
	axiosInstance: AxiosInstance,
	logger?: McpClientLogger,
): KubbClient {
	let clientConfig: Partial<RequestConfig<unknown>> = {
		baseURL: axiosInstance.defaults.baseURL,
	};

	const resilientClient = (async <
		TData,
		_TError = unknown,
		TVariables = unknown,
	>(
		config: RequestConfig<TVariables>,
	): Promise<ResponseConfig<TData>> => {
		return requestWithRetries<TData, TVariables>(axiosInstance, config, logger);
	}) as KubbClient;

	resilientClient.getConfig = () => ({
		...clientConfig,
	});

	resilientClient.setConfig = (config: RequestConfig) => {
		clientConfig = {
			...clientConfig,
			...config,
		};

		if (config.baseURL !== undefined) {
			axiosInstance.defaults.baseURL = config.baseURL;
		}

		return resilientClient.getConfig();
	};

	return resilientClient;
}

// --- Interceptor helpers ---

type TracedConfig = InternalAxiosRequestConfig & {
	_span?: Span;
	_startTime?: number;
};

/**
 * Extract common request metadata from an Axios config.
 * Shared between the success and error response interceptors to avoid
 * duplicating the method/url/endpoint/duration extraction logic.
 */
function extractRequestMeta(config: {
	method?: string;
	url?: string;
	_startTime?: number;
}) {
	const method = (config.method ?? "get").toUpperCase();
	const url = config.url ?? "";
	const endpoint = url.split("?")[0] ?? url;
	const now = Date.now();
	const durationMs = now - (config._startTime ?? now);
	return { method, url, endpoint, durationMs };
}

/**
 * Finalize a traced span and record metrics for a completed HTTP request.
 */
function finalizeRequestTrace(opts: {
	span: Span | undefined;
	statusCode: number;
	durationMs: number;
	method: string;
	endpoint: string;
	error?: unknown;
}) {
	const { span, statusCode, durationMs, method, endpoint, error } = opts;

	if (span) {
		span.setAttribute("http.status_code", statusCode);
		span.setAttribute("http.response.duration_ms", durationMs);
		if (error) {
			span.setStatus({ code: SpanStatusCode.ERROR });
			span.recordException(error as Error);
		} else {
			span.setStatus({ code: SpanStatusCode.OK });
		}
		span.end();
	}

	apiCalls.add(1, { method, endpoint, status_code: statusCode });
	apiDuration.record(durationMs, { method, endpoint });
}

export function createClient(
	apiKey: string,
	baseUrl = "https://api.hevyapp.com",
	options: HevyClientOptions = {},
) {
	const { logger } = options;
	// Create an axios instance with the API key
	const axiosInstance = axios.create({
		baseURL: baseUrl,
		timeout: getApiTimeoutMs(),
		headers: {
			"api-key": apiKey,
		},
	});

	// --- Axios interceptors for HTTP tracing and metrics ---
	axiosInstance.interceptors.request.use((config) => {
		const tracedConfig = config as TracedConfig;
		const method = (config.method ?? "get").toUpperCase();
		const url = config.url ?? "";
		// Extract clean endpoint path without query params for high-cardinality safety
		const endpoint = url.split("?")[0] ?? url;
		tracedConfig._span = tracer.startSpan(`hevy.api.${method}`, {
			attributes: {
				"http.method": method,
				"http.url": url,
				"http.base_url": config.baseURL ?? "",
				"hevy.api.endpoint": endpoint,
			},
		});
		tracedConfig._startTime = Date.now();
		return config;
	});

	axiosInstance.interceptors.response.use(
		(response) => {
			const tracedConfig = response.config as TracedConfig;
			const { method, endpoint, durationMs } = extractRequestMeta({
				method: response.config.method,
				url: response.config.url,
				_startTime: tracedConfig._startTime,
			});
			const requestContext = getRequestContext(response.config);
			debugLog("api_response", {
				method: requestContext.method,
				endpoint: requestContext.endpoint,
				durationMs,
				status: response.status,
			});

			finalizeRequestTrace({
				span: tracedConfig._span,
				statusCode: response.status,
				durationMs,
				method,
				endpoint,
			});

			return response;
		},
		(error) => {
			const tracedConfig = (error.config ?? {}) as TracedConfig;
			const { method, endpoint, durationMs } = extractRequestMeta({
				method: error.config?.method,
				url: error.config?.url,
				_startTime: tracedConfig._startTime,
			});
			const requestContext = getRequestContext(error.config ?? {});
			debugLog("api_response", {
				method: requestContext.method,
				endpoint: requestContext.endpoint,
				durationMs,
				status: error.response?.status ?? null,
			});

			finalizeRequestTrace({
				span: tracedConfig._span,
				statusCode: error.response?.status ?? 0,
				durationMs,
				method,
				endpoint,
				error,
			});

			throw error;
		},
	);

	// Create headers object with API key
	const headers = {
		"api-key": apiKey,
	};

	const client = createResilientClient(axiosInstance, logger);

	// Return an object with all the API methods using ReturnType for automatic type inference
	// All API calls use wrapApi to ensure TypeScript validates arg order matches generated API
	return {
		// Workouts
		getWorkouts: (
			params?: GetV1WorkoutsQueryParams,
		): ReturnType<typeof api.getV1Workouts> =>
			wrapApi(api.getV1Workouts)(headers, params, { client }),
		getWorkout: (
			workoutId: string,
		): ReturnType<typeof api.getV1WorkoutsWorkoutid> =>
			wrapApi(api.getV1WorkoutsWorkoutid)(workoutId, headers, { client }),
		createWorkout: (
			data: PostV1WorkoutsMutationRequest,
		): ReturnType<typeof api.postV1Workouts> =>
			wrapApi(api.postV1Workouts)(data, headers, { client }),
		updateWorkout: (
			workoutId: string,
			data: PutV1WorkoutsWorkoutidMutationRequest,
		): ReturnType<typeof api.putV1WorkoutsWorkoutid> =>
			wrapApi(api.putV1WorkoutsWorkoutid)(workoutId, data, headers, {
				client,
			}),
		getWorkoutCount: (): ReturnType<typeof api.getV1WorkoutsCount> =>
			wrapApi(api.getV1WorkoutsCount)(headers, { client }),
		getWorkoutEvents: (
			params?: GetV1WorkoutsEventsQueryParams,
		): ReturnType<typeof api.getV1WorkoutsEvents> =>
			wrapApi(api.getV1WorkoutsEvents)(headers, params, { client }),

		// Routines
		getRoutines: (
			params?: GetV1RoutinesQueryParams,
		): ReturnType<typeof api.getV1Routines> =>
			wrapApi(api.getV1Routines)(headers, params, { client }),
		getRoutineById: (
			routineId: string,
		): ReturnType<typeof api.getV1RoutinesRoutineid> =>
			wrapApi(api.getV1RoutinesRoutineid)(routineId, headers, { client }),
		createRoutine: (
			data: PostV1RoutinesMutationRequest,
		): ReturnType<typeof api.postV1Routines> =>
			wrapApi(api.postV1Routines)(data, headers, { client }),
		updateRoutine: (
			routineId: string,
			data: PutV1RoutinesRoutineidMutationRequest,
		): ReturnType<typeof api.putV1RoutinesRoutineid> =>
			wrapApi(api.putV1RoutinesRoutineid)(routineId, data, headers, {
				client,
			}),

		// Exercise Templates
		getExerciseTemplates: (
			params?: GetV1ExerciseTemplatesQueryParams,
		): ReturnType<typeof api.getV1ExerciseTemplates> =>
			wrapApi(api.getV1ExerciseTemplates)(headers, params, { client }),
		getExerciseTemplate: (
			templateId: string,
		): ReturnType<typeof api.getV1ExerciseTemplatesExercisetemplateid> =>
			wrapApi(api.getV1ExerciseTemplatesExercisetemplateid)(
				templateId,
				headers,
				{
					client,
				},
			),
		getExerciseHistory: (
			exerciseTemplateId: string,
			params?: GetV1ExerciseHistoryExercisetemplateidQueryParams,
		): ReturnType<typeof api.getV1ExerciseHistoryExercisetemplateid> =>
			wrapApi(api.getV1ExerciseHistoryExercisetemplateid)(
				exerciseTemplateId,
				headers,
				params,
				{ client },
			),
		createExerciseTemplate: (
			data: PostV1ExerciseTemplatesMutationRequest,
		): ReturnType<typeof api.postV1ExerciseTemplates> =>
			wrapApi(api.postV1ExerciseTemplates)(data, headers, { client }),

		// Routine Folders
		getRoutineFolders: (
			params?: GetV1RoutineFoldersQueryParams,
		): ReturnType<typeof api.getV1RoutineFolders> =>
			wrapApi(api.getV1RoutineFolders)(headers, params, { client }),
		createRoutineFolder: (
			data: PostV1RoutineFoldersMutationRequest,
		): ReturnType<typeof api.postV1RoutineFolders> =>
			wrapApi(api.postV1RoutineFolders)(data, headers, { client }),
		getRoutineFolder: (
			folderId: string,
		): ReturnType<typeof api.getV1RoutineFoldersFolderid> =>
			wrapApi(api.getV1RoutineFoldersFolderid)(folderId, headers, {
				client,
			}),

		// Body Measurements
		getBodyMeasurements: (
			params?: GetV1BodyMeasurementsQueryParams,
		): ReturnType<typeof api.getV1BodyMeasurements> =>
			wrapApi(api.getV1BodyMeasurements)(headers, params, { client }),
		getBodyMeasurement: (
			date: string,
		): ReturnType<typeof api.getV1BodyMeasurementsDate> =>
			wrapApi(api.getV1BodyMeasurementsDate)(date, headers, { client }),
		createBodyMeasurement: (
			data: PostV1BodyMeasurementsMutationRequest,
		): ReturnType<typeof api.postV1BodyMeasurements> =>
			wrapApi(api.postV1BodyMeasurements)(data, headers, { client }),
		updateBodyMeasurement: (
			date: string,
			data: PutV1BodyMeasurementsDateMutationRequest,
		): ReturnType<typeof api.putV1BodyMeasurementsDate> =>
			wrapApi(api.putV1BodyMeasurementsDate)(date, data, headers, {
				client,
			}),

		// User
		getUserInfo: (): ReturnType<typeof api.getV1UserInfo> =>
			wrapApi(api.getV1UserInfo)(headers, { client }),
	};
}

/**
 * Type representing the Hevy API client returned by createClient.
 * Useful for typing variables that hold the client instance.
 */
export type HevyApiClient = ReturnType<typeof createClient>;
