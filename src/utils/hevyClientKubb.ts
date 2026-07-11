import type {
	RequestConfig,
	ResponseConfig,
} from "../generated/.kubb/fetch.ts";
import * as api from "../generated/client/api";
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
import {
	HEVY_REQUEST_ABORTED_ERROR_CODE,
	HEVY_RETRY_EXHAUSTED_ERROR_CODE,
	HevyHttpError,
	isHevyHttpError,
} from "./hevy-http-error.js";
import type {
	McpClientLogger,
	McpClientLogMessage,
} from "./mcp-client-logger.js";

type KubbClient = {
	<TData, _TError = unknown, TVariables = unknown>(
		config: RequestConfig<TVariables>,
	): Promise<ResponseConfig<TData>>;
	getConfig: () => Partial<RequestConfig<unknown>>;
	setConfig: (config: RequestConfig) => Partial<RequestConfig<unknown>>;
};

export interface HevyRequestObservation {
	method: string;
	endpoint: string;
	status: number;
	durationMs: number;
	error?: HevyHttpError;
}

export interface HevyClientOptions {
	fetch?: typeof globalThis.fetch;
	logger?: McpClientLogger;
	maxGetRetries?: number;
	onRequestComplete?: (observation: HevyRequestObservation) => void;
	sleep?: (milliseconds: number) => Promise<void>;
	timeoutMs?: number;
}

export const DEFAULT_API_TIMEOUT_MS = 30_000;
export const MAX_GET_RETRIES = 3;
export const RETRY_BACKOFF_BASE_MS = 300;
export { HEVY_RETRY_EXHAUSTED_ERROR_CODE };
export { HEVY_REQUEST_ABORTED_ERROR_CODE };

const RETRY_BACKOFF_MAX_MS = 5_000;
const RETRYABLE_STATUS_CODES = new Set([408, 429]);
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

function wrapApi<T extends (...args: Parameters<T>) => ReturnType<T>>(
	fn: T,
): (...args: Parameters<T>) => ReturnType<T> {
	return fn;
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
	return value === undefined || !Number.isFinite(value) || value <= 0
		? fallback
		: Math.max(1, Math.floor(value));
}

function normalizeMaxGetRetries(value: number | undefined) {
	return value === undefined || !Number.isFinite(value) || value < 0
		? MAX_GET_RETRIES
		: Math.floor(value);
}

function defaultSleep(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getRequestContext(config: { method?: string; url?: string }) {
	const method = (config.method ?? "GET").toUpperCase();
	const rawEndpoint = (config.url ?? "").split("?")[0] ?? "";
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
	} catch {
		console.error("Failed to emit structured Hevy API log");
	}
}

function parseRetryAfterMs(value: string | null): number | undefined {
	if (!value) return undefined;
	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return Math.min(RETRY_BACKOFF_MAX_MS, Math.round(seconds * 1_000));
	}
	const dateMillis = Date.parse(value);
	return Number.isNaN(dateMillis)
		? undefined
		: Math.min(RETRY_BACKOFF_MAX_MS, Math.max(0, dateMillis - Date.now()));
}

function getRetryDelayMs(error: HevyHttpError, retryAttempt: number): number {
	const exponential = Math.min(
		RETRY_BACKOFF_MAX_MS,
		RETRY_BACKOFF_BASE_MS * 2 ** Math.max(0, retryAttempt - 1),
	);
	const retryAfter =
		error.status === 429
			? parseRetryAfterMs(error.headers?.get("retry-after") ?? null)
			: undefined;
	return retryAfter === undefined
		? exponential
		: Math.min(RETRY_BACKOFF_MAX_MS, Math.max(exponential, retryAfter));
}

function buildUrl(baseUrl: string, config: RequestConfig<unknown>): URL {
	if (!config.url?.startsWith("/v1/")) {
		throw new HevyHttpError("Invalid Hevy API endpoint", {
			method: config.method ?? "GET",
			endpoint: "unknown",
			code: "HEVY_INVALID_ENDPOINT",
		});
	}
	const url = new URL(config.url, baseUrl);
	if (config.params && typeof config.params === "object") {
		for (const [key, value] of Object.entries(config.params)) {
			if (value !== undefined) {
				url.searchParams.append(key, value === null ? "null" : String(value));
			}
		}
	}
	return url;
}

async function parseResponseData(response: Response): Promise<unknown> {
	if ([204, 205, 304].includes(response.status) || !response.body) return {};
	const text = await response.text();
	if (!text) return {};
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

function getNetworkCode(error: unknown): string {
	return error instanceof DOMException && error.name === "AbortError"
		? "ETIMEDOUT"
		: "ERR_NETWORK";
}

function isRetryable(error: HevyHttpError): boolean {
	if (error.code === HEVY_REQUEST_ABORTED_ERROR_CODE) return false;
	return (
		error.status === undefined ||
		RETRYABLE_STATUS_CODES.has(error.status) ||
		(error.status >= 500 && error.status <= 599)
	);
}

function createNativeClient(
	apiKey: string,
	baseUrl: string,
	options: HevyClientOptions,
): KubbClient {
	const fetchImplementation = options.fetch ?? globalThis.fetch;
	const maxGetRetries = normalizeMaxGetRetries(options.maxGetRetries);
	const timeoutMs = normalizePositiveInteger(
		options.timeoutMs,
		DEFAULT_API_TIMEOUT_MS,
	);
	const sleep = options.sleep ?? defaultSleep;
	let clientConfig: Partial<RequestConfig<unknown>> = { baseURL: baseUrl };

	const client = (async <TData, _TError = unknown, TVariables = unknown>(
		config: RequestConfig<TVariables>,
	): Promise<ResponseConfig<TData>> => {
		const normalized = { ...clientConfig, ...config } as RequestConfig<unknown>;
		const { method, endpoint } = getRequestContext(normalized);
		const url = buildUrl(baseUrl, normalized);
		let retryCount = 0;

		while (true) {
			if (normalized.signal?.aborted) {
				throw new HevyHttpError("Hevy API request was canceled", {
					method,
					endpoint,
					code: HEVY_REQUEST_ABORTED_ERROR_CODE,
				});
			}
			const startedAt = Date.now();
			const controller = new AbortController();
			const abortFromCaller = () => controller.abort();
			normalized.signal?.addEventListener("abort", abortFromCaller, {
				once: true,
			});
			const timeout = setTimeout(() => controller.abort(), timeoutMs);
			try {
				const headers = new Headers({ "api-key": apiKey });
				if (
					normalized.data !== undefined &&
					!(normalized.data instanceof FormData)
				) {
					headers.set("content-type", "application/json");
				}
				const response = await fetchImplementation(url, {
					method,
					headers,
					redirect: "error",
					body:
						normalized.data instanceof FormData
							? normalized.data
							: normalized.data === undefined
								? undefined
								: JSON.stringify(normalized.data),
					signal: controller.signal,
				});
				const data = await parseResponseData(response);
				if (!response.ok) {
					throw new HevyHttpError(
						`Hevy API request failed (HTTP ${response.status})`,
						{
							status: response.status,
							statusText: response.statusText,
							data,
							headers: response.headers,
							method,
							endpoint,
						},
					);
				}
				options.onRequestComplete?.({
					method,
					endpoint,
					status: response.status,
					durationMs: Date.now() - startedAt,
				});
				return {
					data: data as TData,
					status: response.status,
					statusText: response.statusText,
					headers: response.headers,
				};
			} catch (cause) {
				const error = isHevyHttpError(cause)
					? cause
					: new HevyHttpError(
							normalized.signal?.aborted
								? "Hevy API request was canceled"
								: "Hevy API network request failed",
							{
								method,
								endpoint,
								code: normalized.signal?.aborted
									? HEVY_REQUEST_ABORTED_ERROR_CODE
									: getNetworkCode(cause),
								cause,
							},
						);
				options.onRequestComplete?.({
					method,
					endpoint,
					status: error.status ?? 0,
					durationMs: Date.now() - startedAt,
					error,
				});
				const canRetry = method === "GET" && isRetryable(error);
				if (!canRetry) {
					emitClientLog(options.logger, {
						level: "error",
						logger: "hevy-api",
						data: {
							message: "Hevy API request failed",
							status: error.status ?? null,
							method,
							endpoint,
						},
					});
					throw error;
				}
				if (retryCount >= maxGetRetries) {
					error.hevyRetryExhausted = true;
					error.hevyRetryCount = retryCount;
					error.code = HEVY_RETRY_EXHAUSTED_ERROR_CODE;
					throw error;
				}
				retryCount += 1;
				const delayMs = getRetryDelayMs(error, retryCount);
				emitClientLog(options.logger, {
					level: error.status === 429 ? "warning" : "debug",
					logger: "hevy-api",
					data: {
						message: "Retrying Hevy API request",
						status: error.status ?? null,
						attempt: retryCount + 1,
						maxAttempts: maxGetRetries + 1,
						delayMs,
						method,
						endpoint,
					},
				});
				await sleep(delayMs);
			} finally {
				clearTimeout(timeout);
				normalized.signal?.removeEventListener("abort", abortFromCaller);
			}
		}
	}) as KubbClient;

	client.getConfig = () => ({ ...clientConfig });
	client.setConfig = (config: RequestConfig) => {
		clientConfig = { ...clientConfig, ...config, baseURL: baseUrl };
		return client.getConfig();
	};
	return client;
}

export function createClient(
	apiKey: string,
	baseUrl = "https://api.hevyapp.com",
	options: HevyClientOptions = {},
) {
	const headers = { "api-key": apiKey };
	const client = createNativeClient(apiKey, baseUrl, options);
	return {
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
			wrapApi(api.putV1WorkoutsWorkoutid)(workoutId, data, headers, { client }),
		getWorkoutCount: (): ReturnType<typeof api.getV1WorkoutsCount> =>
			wrapApi(api.getV1WorkoutsCount)(headers, { client }),
		getWorkoutEvents: (
			params?: GetV1WorkoutsEventsQueryParams,
		): ReturnType<typeof api.getV1WorkoutsEvents> =>
			wrapApi(api.getV1WorkoutsEvents)(headers, params, { client }),
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
			wrapApi(api.putV1RoutinesRoutineid)(routineId, data, headers, { client }),
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
				{ client },
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
			wrapApi(api.getV1RoutineFoldersFolderid)(folderId, headers, { client }),
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
			wrapApi(api.putV1BodyMeasurementsDate)(date, data, headers, { client }),
		getUserInfo: (
			config: Partial<RequestConfig> = {},
		): ReturnType<typeof api.getV1UserInfo> =>
			wrapApi(api.getV1UserInfo)(headers, { ...config, client }),
	};
}

export type HevyApiClient = ReturnType<typeof createClient>;
