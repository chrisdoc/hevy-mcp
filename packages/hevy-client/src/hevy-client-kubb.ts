import { z } from "zod";

const objectSchema = z.object({}).passthrough();
const numberSchema = z.number();
const stringSchema = z.string();
const isObject = <T>(value: T): value is T & object =>
	objectSchema.safeParse(value).success;
const isNumber = <T>(value: T): value is T & number =>
	numberSchema.safeParse(value).success;
const isString = <T>(value: T): value is T & string =>
	stringSchema.safeParse(value).success;

import type { RequestConfig, ResponseConfig } from "./fetch.ts";
import * as api from "./generated/client/api";
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
	PostV1Routines201,
	PostV1RoutinesMutationRequest,
	Routine,
	PostV1WorkoutsMutationRequest,
	PutV1BodyMeasurementsDateMutationRequest,
	PutV1RoutinesRoutineidMutationRequest,
	PutV1WorkoutsWorkoutidMutationRequest,
} from "./generated/client/types";
import {
	HEVY_REQUEST_ABORTED_ERROR_CODE,
	HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
	HEVY_RETRY_EXHAUSTED_ERROR_CODE,
	HevyHttpError,
	isHevyHttpError,
} from "./hevy-http-error.js";
import {
	canonicalEndpointIdentity,
	expectedGet404Outcome,
	isTransientRetryFailure,
} from "./endpoint-policy.js";
import {
	canRetryOperation,
	commitStateFor,
	createExecutionSignal,
	isAbortLike,
	isDeadlineExceeded,
	operationSafetyForMethod,
	remainingDeadlineMs,
	type HevyCommitState,
	type HevyOperationSafety,
	type HevyRequestOptions,
	type HevyRequestPhase,
} from "./execution.js";
export interface HevyClientLogEvent {
	readonly level: "debug" | "warning" | "error";
	readonly logger: "hevy-api";
	readonly data: Readonly<{
		message: "Hevy API request failed" | "Retrying Hevy API request";
		status: number | null;
		method: string;
		endpoint: string;
		attempt?: number;
		maxAttempts?: number;
		delayMs?: number;
	}>;
}

export type HevyClientLogger = (event: HevyClientLogEvent) => void;

type KubbClient = {
	<TData, _TError = unknown, TVariables = unknown>(
		config: RequestConfig<TVariables> & InternalRequestControl,
	): Promise<ResponseConfig<TData>>;
	getConfig: () => Partial<RequestConfig<unknown>>;
	setConfig: (config: RequestConfig) => Partial<RequestConfig<unknown>>;
};

type InternalRequestControl = {
	readonly hevyDeadline?: number;
};
type MutableRequest = {
	hevyDeadline?: number;
	client: KubbClient;
	signal?: AbortSignal;
};

export type HevyApiOutcome =
	| "success"
	| "retryable_failure"
	| "terminal_failure"
	| "expected"
	| "cancelled"
	| "deadline_exceeded";

export interface HevyRequestStart {
	readonly method: string;
	readonly endpoint: string;
	readonly retryCount: number;
}

export interface HevyRequestObservation {
	readonly method: string;
	readonly endpoint: string;
	readonly status: number;
	readonly durationMs: number;
	readonly retryCount: number;
	readonly outcome: HevyApiOutcome;
	readonly phase?: HevyRequestPhase;
	readonly operationSafety?: HevyOperationSafety;
	readonly commitState?: HevyCommitState;
	readonly safeToRetry?: boolean;
	readonly expectedReason?: "not_found" | "end_of_list";
	readonly error?: {
		readonly status?: number;
		readonly code?: string;
		readonly category?: "HevyHttpError" | "NetworkError";
		/** Bounded, sanitized text from an allowlisted upstream error field. */
		readonly response_error?: string;
	};
}

export interface HevyRequestObservationScope {
	finish(observation: HevyRequestObservation): void;
	run?<T>(operation: () => Promise<T>): Promise<T>;
}

export interface HevyRetryWait {
	readonly method: string;
	readonly endpoint: string;
	readonly retryCount: number;
	readonly delayMs: number;
}

export interface HevyRetryWaitScope {
	finish(): void;
}

export interface HevyClientOptions {
	fetch?: typeof globalThis.fetch;
	onLog?: HevyClientLogger;
	maxGetRetries?: number;
	onRequestStart?: (
		observation: HevyRequestStart,
	) => HevyRequestObservationScope | void;
	onRequestComplete?: (observation: HevyRequestObservation) => void;
	onRetryWait?: (observation: HevyRetryWait) => HevyRetryWaitScope | void;
	sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
	timeoutMs?: number;
}

// Hevy's larger collection endpoints can take longer than the usual HTTP
// request window, especially when returning exercise templates or workouts.
export const DEFAULT_API_TIMEOUT_MS = 60_000;
export const MAX_GET_RETRIES = 3;
export const RETRY_BACKOFF_BASE_MS = 300;
export { HEVY_RETRY_EXHAUSTED_ERROR_CODE };
export { HEVY_REQUEST_ABORTED_ERROR_CODE };
export { HEVY_DEADLINE_EXCEEDED_ERROR_CODE };

const RETRY_BACKOFF_MAX_MS = 5_000;
export const SAFE_OBSERVATION_CODES = new Set([
	"EAI_AGAIN",
	"ECONNABORTED",
	"ECONNREFUSED",
	"ECONNRESET",
	"ENETUNREACH",
	"ENOTFOUND",
	"ERR_NETWORK",
	"ERR_SOCKET_TIMEOUT",
	"ETIMEDOUT",
	HEVY_REQUEST_ABORTED_ERROR_CODE,
	HEVY_RETRY_EXHAUSTED_ERROR_CODE,
	HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
]);
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

function defaultSleep(
	milliseconds: number,
	signal?: AbortSignal,
): Promise<void> {
	if (signal?.aborted) {
		return Promise.reject(
			signal.reason ?? new DOMException("Operation canceled", "AbortError"),
		);
	}
	return new Promise((resolve, reject) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const cleanup = () => {
			if (timer !== undefined) clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
		};
		const resolveSleep = () => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve();
		};
		const rejectSleep = <T>(reason: T) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(reason);
		};
		const onAbort = () =>
			rejectSleep(
				signal?.reason ?? new DOMException("Operation canceled", "AbortError"),
			);
		timer = setTimeout(resolveSleep, Math.max(0, milliseconds));
		signal?.addEventListener("abort", onAbort, { once: true });
		if (signal?.aborted) onAbort();
	});
}

function withTimeout<T>(
	operation: Promise<T>,
	timeoutMs: number,
	onTimeout: () => void,
	signal?: AbortSignal,
): Promise<T> {
	const promise = new Promise<T>((resolve, reject) => {
		let settled = false;
		const onAbort = () => {
			if (settled) return;
			settled = true;
			if (timer !== undefined) clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			reject(
				signal?.reason ?? new DOMException("Operation canceled", "AbortError"),
			);
		};
		const timer = Number.isFinite(timeoutMs)
			? setTimeout(
					() => {
						if (settled) return;
						settled = true;
						signal?.removeEventListener("abort", onAbort);
						onTimeout();
						reject(new DOMException("Operation timed out", "TimeoutError"));
					},
					Math.max(0, timeoutMs),
				)
			: undefined;
		operation.then(
			(value) => {
				if (settled) return;
				settled = true;
				if (timer !== undefined) clearTimeout(timer);
				signal?.removeEventListener("abort", onAbort);
				resolve(value);
			},
			<T>(error: T) => {
				if (settled) return;
				settled = true;
				if (timer !== undefined) clearTimeout(timer);
				signal?.removeEventListener("abort", onAbort);
				reject(error);
			},
		);
		if (signal?.aborted) onAbort();
		else signal?.addEventListener("abort", onAbort, { once: true });
	});
	return promise;
}

function getRequestContext(config: {
	method?: string;
	url?: string;
	params?: unknown;
}) {
	const method = (config.method ?? "GET").toUpperCase();
	const endpoint = canonicalEndpointIdentity(config.url ?? "");
	const page =
		config.params !== null &&
		isObject(config.params) &&
		"page" in config.params &&
		isNumber(config.params.page)
			? config.params.page
			: undefined;
	return { method, endpoint, page };
}

function emitClientLog(
	logger: HevyClientLogger | undefined,
	message: HevyClientLogEvent,
): void {
	try {
		logger?.(message);
	} catch {
		console.error("Failed to emit structured Hevy API log");
	}
}

function emitRequestStart(
	observer: HevyClientOptions["onRequestStart"],
	observation: HevyRequestStart,
): HevyRequestObservationScope | undefined {
	try {
		return observer?.(observation) ?? undefined;
	} catch {
		return undefined;
	}
}

function finishRequestObservation(
	scope: HevyRequestObservationScope | undefined,
	observation: HevyRequestObservation,
): void {
	try {
		scope?.finish(observation);
	} catch {
		// Client observation is best-effort and cannot affect request behavior.
	}
}

function emitRequestObservation(
	observer: HevyClientOptions["onRequestComplete"],
	observation: HevyRequestObservation,
): void {
	try {
		observer?.(observation);
	} catch {
		// Client observation is best-effort and cannot affect request behavior.
	}
}

function runRequestObservation<T>(
	scope: HevyRequestObservationScope | undefined,
	operation: () => Promise<T>,
): Promise<T> {
	if (!scope?.run) return operation();
	let started = false;
	const trackedOperation = () => {
		started = true;
		return operation();
	};
	try {
		return scope.run(trackedOperation);
	} catch (error) {
		if (started) throw error;
		return operation();
	}
}

function emitRetryWait(
	observer: HevyClientOptions["onRetryWait"],
	observation: HevyRetryWait,
): HevyRetryWaitScope | undefined {
	try {
		return observer?.(observation) ?? undefined;
	} catch {
		return undefined;
	}
}

function finishRetryWait(scope: HevyRetryWaitScope | undefined): void {
	try {
		scope?.finish();
	} catch {
		// Client observation is best-effort and cannot affect request behavior.
	}
}

function parseRetryAfterMs(value: string | null): number | undefined {
	if (!value) return undefined;
	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return Math.round(seconds * 1_000);
	}
	const dateMillis = Date.parse(value);
	return Number.isNaN(dateMillis)
		? undefined
		: Math.max(0, dateMillis - Date.now());
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
	if (retryAfter === undefined) return exponential;
	// Keep the server's usable lower bound while adding bounded jitter to avoid
	// a thundering herd when many callers receive the same Retry-After value.
	const jitter = Math.floor(
		Math.random() * Math.min(250, Math.max(1, retryAfter * 0.1)),
	);
	return Math.max(exponential, retryAfter) + jitter;
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
	if (config.params && isObject(config.params)) {
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

function getNetworkCode<T>(error: T): string {
	return error instanceof DOMException && error.name === "AbortError"
		? "ETIMEDOUT"
		: "ERR_NETWORK";
}

function isRetryable(error: HevyHttpError): boolean {
	return isTransientRetryFailure(error.status, error.code);
}

async function waitForRetry(
	delayMs: number,
	signal: AbortSignal,
	sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>,
): Promise<void> {
	if (signal.aborted) {
		throw signal.reason ?? new DOMException("Operation canceled", "AbortError");
	}
	await new Promise<void>((resolve, reject) => {
		let settled = false;
		const onAbort = () => {
			if (settled) return;
			settled = true;
			signal.removeEventListener("abort", onAbort);
			reject(
				signal.reason ?? new DOMException("Operation canceled", "AbortError"),
			);
		};
		signal.addEventListener("abort", onAbort, { once: true });
		void sleep(delayMs, signal).then(
			() => {
				if (settled) return;
				settled = true;
				signal.removeEventListener("abort", onAbort);
				resolve();
			},
			(error) => {
				if (settled) return;
				settled = true;
				signal.removeEventListener("abort", onAbort);
				reject(error);
			},
		);
	});
}

interface ExecutionErrorOptions {
	method: string;
	endpoint: string;
	safety: HevyOperationSafety;
	phase: HevyRequestPhase;
	deadlineExceeded: boolean;
	canceled: boolean;
	responseConfirmed?: boolean;
	code?: string;
	cause?: unknown;
}

interface ExecutionFailureState {
	deadlineExceeded: boolean;
	canceled: boolean;
	attemptTimedOut: boolean;
}

function classifyExecutionFailure(
	cause: unknown,
	executionSignal: AbortSignal,
	deadline: number,
	deadlineTriggered = false,
): ExecutionFailureState {
	const attemptTimedOut = isAbortLike(cause) && !executionSignal.aborted;
	const deadlineExceeded =
		deadlineTriggered ||
		isDeadlineExceeded(deadline) ||
		(attemptTimedOut &&
			cause instanceof Error &&
			cause.name === "TimeoutError");
	return {
		deadlineExceeded,
		canceled: executionSignal.aborted && !deadlineExceeded,
		attemptTimedOut,
	};
}

function createExecutionError(options: ExecutionErrorOptions): HevyHttpError {
	const { deadlineExceeded, canceled } = options;
	return new HevyHttpError(
		deadlineExceeded
			? "Hevy API request deadline exceeded"
			: canceled
				? "Hevy API request was canceled"
				: "Hevy API network request failed",
		{
			method: options.method,
			endpoint: options.endpoint,
			code: deadlineExceeded
				? HEVY_DEADLINE_EXCEEDED_ERROR_CODE
				: canceled
					? HEVY_REQUEST_ABORTED_ERROR_CODE
					: (options.code ?? "ERR_NETWORK"),
			phase: options.phase,
			operationSafety: options.safety,
			commitState: commitStateFor(
				options.safety,
				options.phase,
				options.responseConfirmed ?? false,
			),
			safeToRetry: false,
			outcome: deadlineExceeded
				? "deadline_exceeded"
				: canceled
					? "cancelled"
					: "terminal_failure",
			cause: options.cause,
		},
	);
}

function applyExecutionMetadata(
	error: HevyHttpError,
	phase: HevyRequestPhase,
	safety: HevyOperationSafety,
	commitState: HevyCommitState,
	safeToRetry: boolean,
	outcome: HevyApiOutcome,
): void {
	error.setExecutionMetadata({
		phase,
		operationSafety: safety,
		commitState,
		safeToRetry,
		outcome,
	});
}

/** Rebind caller-supplied errors to the sanitized request identity. */
function normalizeHevyHttpError(
	error: HevyHttpError,
	method: string,
	endpoint: string,
): HevyHttpError {
	const normalized = new HevyHttpError(error.message, {
		status: error.status,
		statusText: error.statusText,
		data: error.data,
		headers: error.headers,
		method,
		endpoint,
		code: error.code,
		cause: error.cause,
		phase: error.phase,
		operationSafety: error.operationSafety,
		commitState: error.commitState,
		safeToRetry: error.safeToRetry,
		outcome: error.outcome,
	});
	normalized.hevyRetryCount = error.hevyRetryCount;
	normalized.hevyRetryExhausted = error.hevyRetryExhausted;
	return normalized;
}

function requestOptions(
	options: HevyRequestOptions | undefined,
	client: KubbClient,
): InternalRequestControl & { client: KubbClient; signal?: AbortSignal } {
	const request: MutableRequest = { client };
	if (options?.signal) request.signal = options.signal;
	if (options?.deadline !== undefined) request.hevyDeadline = options.deadline;
	return request;
}

interface RequestAttemptExecutionOptions {
	apiKey: string;
	fetchImplementation: typeof globalThis.fetch;
	normalized: RequestConfig<unknown> & InternalRequestControl;
	url: URL;
	method: string;
	endpoint: string;
	safety: HevyOperationSafety;
	deadline: number;
	executionSignal: AbortSignal;
	startedAt: number;
	retryCount: number;
	observationScope: HevyRequestObservationScope | undefined;
	onRequestComplete: HevyClientOptions["onRequestComplete"];
}

type RequestAttemptOutcome<TData> =
	| {
			readonly ok: true;
			readonly result: ResponseConfig<TData>;
	  }
	| {
			readonly ok: false;
			readonly cause: unknown;
			readonly phase: HevyRequestPhase;
			readonly responseConfirmed: boolean;
	  };

/** Execute one dispatch/response attempt and retain its safe phase state. */
async function executeRequestAttempt<TData>(
	options: RequestAttemptExecutionOptions,
): Promise<RequestAttemptOutcome<TData>> {
	let phase: HevyRequestPhase = "before-dispatch";
	let responseConfirmed = false;
	const attemptController = new AbortController();
	const abortAttempt = () =>
		attemptController.abort(options.executionSignal.reason);
	options.executionSignal.addEventListener("abort", abortAttempt, {
		once: true,
	});
	try {
		const result = await runRequestObservation(
			options.observationScope,
			async () => {
				const headers = new Headers({ "api-key": options.apiKey });
				if (
					options.normalized.data !== undefined &&
					!(options.normalized.data instanceof FormData)
				) {
					headers.set("content-type", "application/json");
				}
				const requestInit: RequestInit = {
					method: options.method,
					headers,
					redirect: "manual",
					body:
						options.normalized.data instanceof FormData
							? options.normalized.data
							: options.normalized.data === undefined
								? undefined
								: JSON.stringify(options.normalized.data),
					signal: attemptController.signal,
				};
				let fetchPromise: Promise<Response>;
				try {
					const fetchImplementation = options.fetchImplementation;
					fetchPromise = Promise.resolve(
						fetchImplementation(options.url, requestInit),
					);
				} catch (error) {
					phase = "before-dispatch";
					throw error;
				}
				phase = "dispatch";
				const response = await withTimeout(
					fetchPromise,
					remainingDeadlineMs(options.deadline),
					() =>
						attemptController.abort(
							new DOMException("Operation timed out", "TimeoutError"),
						),
					attemptController.signal,
				);
				phase = "response-headers";
				phase = "response-content";
				const data = await withTimeout(
					parseResponseData(response),
					remainingDeadlineMs(options.deadline),
					() =>
						attemptController.abort(
							new DOMException("Operation timed out", "TimeoutError"),
						),
					attemptController.signal,
				);
				if (!response.ok) {
					throw new HevyHttpError(
						`Hevy API request failed (HTTP ${response.status})`,
						{
							status: response.status,
							statusText: response.statusText,
							data,
							headers: response.headers,
							method: options.method,
							endpoint: options.endpoint,
							phase,
							operationSafety: options.safety,
							commitState: commitStateFor(options.safety, phase, false),
							safeToRetry: false,
						},
					);
				}
				responseConfirmed = true;
				const observation: HevyRequestObservation = {
					method: options.method,
					endpoint: options.endpoint,
					status: response.status,
					durationMs: Date.now() - options.startedAt,
					retryCount: options.retryCount,
					outcome: "success",
					phase: "completed",
					operationSafety: options.safety,
					commitState: "confirmed",
					safeToRetry: false,
				};
				finishRequestObservation(options.observationScope, observation);
				emitRequestObservation(options.onRequestComplete, observation);
				return {
					data: data as TData,
					status: response.status,
					statusText: response.statusText,
					headers: response.headers,
				};
			},
		);
		return { ok: true, result };
	} catch (cause) {
		return { ok: false, cause, phase, responseConfirmed };
	} finally {
		options.executionSignal.removeEventListener("abort", abortAttempt);
	}
}

interface AttemptFailureTransitionOptions {
	cause: unknown;
	method: string;
	endpoint: string;
	page: number | undefined;
	safety: HevyOperationSafety;
	phase: HevyRequestPhase;
	responseConfirmed: boolean;
	executionSignal: ReturnType<typeof createExecutionSignal>;
	deadline: number;
	retryCount: number;
	maxGetRetries: number;
	startedAt: number;
	observationScope: HevyRequestObservationScope | undefined;
	clientOptions: HevyClientOptions;
}

interface AttemptFailureTransition {
	readonly retry: boolean;
	readonly error: HevyHttpError;
	readonly retryCount: number;
	readonly delayMs?: number;
	readonly retryWaitScope?: HevyRetryWaitScope;
}

function createAttemptFailureError(
	options: AttemptFailureTransitionOptions,
	failure: ExecutionFailureState,
): HevyHttpError {
	if (isHevyHttpError(options.cause)) {
		return normalizeHevyHttpError(
			options.cause,
			options.method,
			options.endpoint,
		);
	}
	return createExecutionError({
		method: options.method,
		endpoint: options.endpoint,
		safety: options.safety,
		phase: options.phase,
		deadlineExceeded: failure.deadlineExceeded,
		canceled: failure.canceled,
		responseConfirmed: options.responseConfirmed,
		code: failure.attemptTimedOut ? "ETIMEDOUT" : getNetworkCode(options.cause),
		cause: options.cause,
	});
}

function canRetryAttempt(
	options: AttemptFailureTransitionOptions,
	failure: ExecutionFailureState,
	error: HevyHttpError,
): boolean {
	return (
		!failure.deadlineExceeded &&
		!failure.canceled &&
		options.safety !== "non-idempotent-write" &&
		canRetryOperation(options.safety, options.phase) &&
		isRetryable(error) &&
		remainingDeadlineMs(options.deadline) > 0
	);
}

function failureMetadataOutcome(
	failure: ExecutionFailureState,
): HevyApiOutcome {
	if (failure.deadlineExceeded) return "deadline_exceeded";
	if (failure.canceled) return "cancelled";
	return "terminal_failure";
}

function applyRetryExhaustion(
	error: HevyHttpError,
	options: AttemptFailureTransitionOptions,
	safeToRetry: boolean,
): boolean {
	if (!safeToRetry || options.retryCount < options.maxGetRetries) return false;
	error.hevyRetryExhausted = true;
	error.hevyRetryCount = options.retryCount;
	error.code = HEVY_RETRY_EXHAUSTED_ERROR_CODE;
	error.setExecutionMetadata({
		phase: error.phase,
		operationSafety: error.operationSafety,
		commitState: error.commitState,
		safeToRetry: false,
		outcome: "terminal_failure",
	});
	return true;
}

function failureObservationOutcome(
	failure: ExecutionFailureState,
	expectedReason: HevyRequestObservation["expectedReason"],
	safeToRetry: boolean,
	retryExhausted: boolean,
): HevyApiOutcome {
	if (expectedReason) return "expected";
	if (failure.deadlineExceeded) return "deadline_exceeded";
	if (failure.canceled) return "cancelled";
	if (safeToRetry && !retryExhausted) return "retryable_failure";
	return "terminal_failure";
}

function createFailureObservation(
	options: AttemptFailureTransitionOptions,
	failure: ExecutionFailureState,
	error: HevyHttpError,
	commitState: HevyCommitState,
	safeToRetry: boolean,
	retryExhausted: boolean,
	expectedReason: HevyRequestObservation["expectedReason"],
): HevyRequestObservation {
	const observation: Omit<
		HevyRequestObservation,
		"expectedReason" | "error"
	> & {
		expectedReason?: HevyRequestObservation["expectedReason"];
		error?: {
			status?: number;
			code?: string;
			category?: "HevyHttpError" | "NetworkError";
			response_error?: string;
		};
	} = {
		method: options.method,
		endpoint: options.endpoint,
		status: error.status ?? 0,
		durationMs: Date.now() - options.startedAt,
		retryCount: options.retryCount,
		outcome: failureObservationOutcome(
			failure,
			expectedReason,
			safeToRetry,
			retryExhausted,
		),
		phase: options.phase,
		operationSafety: options.safety,
		commitState,
		safeToRetry: safeToRetry && !retryExhausted,
		error: {
			status: error.status,
			code:
				isString(error.code) && SAFE_OBSERVATION_CODES.has(error.code)
					? error.code
					: undefined,
			category: error.status === undefined ? "NetworkError" : "HevyHttpError",
		},
	};
	if (expectedReason) observation.expectedReason = expectedReason;
	if (error.responseError && observation.error) {
		observation.error = {
			...observation.error,
			response_error: error.responseError,
		};
	}
	return observation;
}

function emitTerminalFailureLog(
	options: AttemptFailureTransitionOptions,
	error: HevyHttpError,
): void {
	emitClientLog(options.clientOptions.onLog, {
		level: "error",
		logger: "hevy-api",
		data: {
			message: "Hevy API request failed",
			status: error.status ?? null,
			method: options.method,
			endpoint: options.endpoint,
		},
	});
}

function createRetryTransition(
	options: AttemptFailureTransitionOptions,
	error: HevyHttpError,
): AttemptFailureTransition {
	const retryCount = options.retryCount + 1;
	const delayMs = getRetryDelayMs(error, retryCount);
	emitClientLog(options.clientOptions.onLog, {
		level: error.status === 429 ? "warning" : "debug",
		logger: "hevy-api",
		data: {
			message: "Retrying Hevy API request",
			status: error.status ?? null,
			attempt: retryCount + 1,
			maxAttempts: options.maxGetRetries + 1,
			delayMs,
			method: options.method,
			endpoint: options.endpoint,
		},
	});
	return {
		retry: true,
		error,
		retryCount,
		delayMs,
		retryWaitScope: emitRetryWait(options.clientOptions.onRetryWait, {
			method: options.method,
			endpoint: options.endpoint,
			retryCount,
			delayMs,
		}),
	};
}

/** Classify an attempt failure, emit its observation, and choose retry/backoff. */
function transitionAfterAttemptFailure(
	options: AttemptFailureTransitionOptions,
): AttemptFailureTransition {
	const failure = classifyExecutionFailure(
		options.cause,
		options.executionSignal.signal,
		options.deadline,
		options.executionSignal.deadlineTriggered(),
	);
	const error = createAttemptFailureError(options, failure);
	const safeToRetry = canRetryAttempt(options, failure, error);
	const commitState =
		error.commitState ??
		commitStateFor(options.safety, options.phase, options.responseConfirmed);
	applyExecutionMetadata(
		error,
		options.phase,
		options.safety,
		commitState,
		safeToRetry,
		failureMetadataOutcome(failure),
	);
	const expectedReason = expectedGet404Outcome(
		options.endpoint,
		options.method,
		error.status,
		options.page,
	);
	const retryExhausted = applyRetryExhaustion(error, options, safeToRetry);
	const observation = createFailureObservation(
		options,
		failure,
		error,
		commitState,
		safeToRetry,
		retryExhausted,
		expectedReason,
	);
	finishRequestObservation(options.observationScope, observation);
	emitRequestObservation(options.clientOptions.onRequestComplete, observation);
	if (expectedReason || !safeToRetry || retryExhausted) {
		emitTerminalFailureLog(options, error);
		return {
			retry: false,
			error,
			retryCount: options.retryCount,
		};
	}
	return createRetryTransition(options, error);
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
		config: RequestConfig<TVariables> & InternalRequestControl,
	): Promise<ResponseConfig<TData>> => {
		const normalized = {
			...clientConfig,
			...config,
		} as RequestConfig<unknown> & InternalRequestControl;
		const { method, endpoint, page } = getRequestContext(normalized);
		const url = buildUrl(baseUrl, normalized);
		// The HTTP method is authoritative for operation safety and retry policy.
		const safety = operationSafetyForMethod(method);
		// `timeoutMs` is the default logical-operation budget. Establish its
		// absolute deadline once so retries and response-body consumption cannot
		// each restart a fresh timeout window.
		const deadline = normalized.hevyDeadline ?? Date.now() + timeoutMs;
		const executionSignal = createExecutionSignal({
			signal: normalized.signal,
			deadline,
		});
		let retryCount = 0;

		try {
			while (true) {
				const remaining = remainingDeadlineMs(deadline);
				if (executionSignal.signal.aborted || remaining <= 0) {
					const deadlineExceeded = remaining <= 0;
					const error = createExecutionError({
						method,
						endpoint,
						safety,
						phase: "before-dispatch",
						deadlineExceeded,
						canceled: !deadlineExceeded,
					});
					emitRequestObservation(options.onRequestComplete, {
						method,
						endpoint,
						status: 0,
						durationMs: 0,
						retryCount,
						outcome: error.outcome ?? "cancelled",
						phase: error.phase,
						operationSafety: safety,
						commitState: error.commitState,
						safeToRetry: false,
						error: {
							code: error.code,
							category: "NetworkError",
						},
					});
					throw error;
				}
				const startedAt = Date.now();
				const observationScope = emitRequestStart(options.onRequestStart, {
					method,
					endpoint,
					retryCount,
				});
				const attempt = await executeRequestAttempt<TData>({
					apiKey,
					fetchImplementation,
					normalized,
					url,
					method,
					endpoint,
					safety,
					deadline,
					executionSignal: executionSignal.signal,
					startedAt,
					retryCount,
					observationScope,
					onRequestComplete: options.onRequestComplete,
				});
				if (attempt.ok) return attempt.result;
				{
					const { cause, phase, responseConfirmed } = attempt;
					const transition = transitionAfterAttemptFailure({
						cause,
						method,
						endpoint,
						page,
						safety,
						phase,
						responseConfirmed,
						executionSignal,
						deadline,
						retryCount,
						maxGetRetries,
						startedAt,
						observationScope,
						clientOptions: options,
					});
					if (!transition.retry) throw transition.error;
					retryCount = transition.retryCount;
					const delayMs = transition.delayMs ?? 0;
					const remaining = remainingDeadlineMs(deadline);
					try {
						await runRequestObservation(observationScope, () =>
							waitForRetry(
								Math.min(delayMs, Math.max(0, remaining)),
								executionSignal.signal,
								sleep,
							),
						);
					} catch (waitError) {
						const waitDeadlineExceeded =
							executionSignal.deadlineTriggered() ||
							isDeadlineExceeded(deadline);
						const waitErrorResponse = createExecutionError({
							method,
							endpoint,
							safety,
							phase: "backoff",
							deadlineExceeded: waitDeadlineExceeded,
							canceled: !waitDeadlineExceeded,
							cause: waitError,
						});
						emitRequestObservation(options.onRequestComplete, {
							method,
							endpoint,
							status: 0,
							durationMs: Date.now() - startedAt,
							retryCount,
							outcome: waitErrorResponse.outcome ?? "cancelled",
							phase: waitErrorResponse.phase,
							operationSafety: safety,
							commitState: waitErrorResponse.commitState,
							safeToRetry: false,
							error: {
								code: waitErrorResponse.code,
								category: "NetworkError",
							},
						});
						throw waitErrorResponse;
					} finally {
						finishRetryWait(transition.retryWaitScope);
					}
				}
			}
		} finally {
			executionSignal.cleanup();
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
			options?: HevyRequestOptions,
		): ReturnType<typeof api.getV1Workouts> =>
			api.getV1Workouts(headers, params, requestOptions(options, client)),
		getWorkout: (
			workoutId: string,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.getV1WorkoutsWorkoutid> =>
			api.getV1WorkoutsWorkoutid(
				workoutId,
				headers,
				requestOptions(options, client),
			),
		createWorkout: (
			data: PostV1WorkoutsMutationRequest,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.postV1Workouts> =>
			api.postV1Workouts(data, headers, requestOptions(options, client)),
		updateWorkout: (
			workoutId: string,
			data: PutV1WorkoutsWorkoutidMutationRequest,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.putV1WorkoutsWorkoutid> =>
			api.putV1WorkoutsWorkoutid(
				workoutId,
				data,
				headers,
				requestOptions(options, client),
			),
		getWorkoutCount: (
			options?: HevyRequestOptions,
		): ReturnType<typeof api.getV1WorkoutsCount> =>
			api.getV1WorkoutsCount(headers, requestOptions(options, client)),
		getWorkoutEvents: (
			params?: GetV1WorkoutsEventsQueryParams,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.getV1WorkoutsEvents> =>
			api.getV1WorkoutsEvents(headers, params, requestOptions(options, client)),
		getRoutines: (
			params?: GetV1RoutinesQueryParams,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.getV1Routines> =>
			api.getV1Routines(headers, params, requestOptions(options, client)),
		getRoutineById: (
			routineId: string,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.getV1RoutinesRoutineid> =>
			api.getV1RoutinesRoutineid(
				routineId,
				headers,
				requestOptions(options, client),
			),
		createRoutine: async (
			data: PostV1RoutinesMutationRequest,
			options?: HevyRequestOptions,
		): Promise<Routine | undefined> => {
			const response: PostV1Routines201 = await api.postV1Routines(
				data,
				headers,
				requestOptions(options, client),
			);
			return Object.keys(response).length === 0
				? undefined
				: (response as Routine);
		},
		updateRoutine: (
			routineId: string,
			data: PutV1RoutinesRoutineidMutationRequest,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.putV1RoutinesRoutineid> =>
			api.putV1RoutinesRoutineid(
				routineId,
				data,
				headers,
				requestOptions(options, client),
			),
		getExerciseTemplates: (
			params?: GetV1ExerciseTemplatesQueryParams,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.getV1ExerciseTemplates> =>
			api.getV1ExerciseTemplates(
				headers,
				params,
				requestOptions(options, client),
			),
		getExerciseTemplate: (
			templateId: string,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.getV1ExerciseTemplatesExercisetemplateid> =>
			api.getV1ExerciseTemplatesExercisetemplateid(
				templateId,
				headers,
				requestOptions(options, client),
			),
		getExerciseHistory: (
			exerciseTemplateId: string,
			params?: GetV1ExerciseHistoryExercisetemplateidQueryParams,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.getV1ExerciseHistoryExercisetemplateid> =>
			api.getV1ExerciseHistoryExercisetemplateid(
				exerciseTemplateId,
				headers,
				params,
				requestOptions(options, client),
			),
		createExerciseTemplate: (
			data: PostV1ExerciseTemplatesMutationRequest,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.postV1ExerciseTemplates> =>
			api.postV1ExerciseTemplates(
				data,
				headers,
				requestOptions(options, client),
			),
		getRoutineFolders: (
			params?: GetV1RoutineFoldersQueryParams,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.getV1RoutineFolders> =>
			api.getV1RoutineFolders(headers, params, requestOptions(options, client)),
		createRoutineFolder: (
			data: PostV1RoutineFoldersMutationRequest,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.postV1RoutineFolders> =>
			api.postV1RoutineFolders(data, headers, requestOptions(options, client)),
		getRoutineFolder: (
			folderId: string,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.getV1RoutineFoldersFolderid> =>
			api.getV1RoutineFoldersFolderid(
				folderId,
				headers,
				requestOptions(options, client),
			),
		getBodyMeasurements: (
			params?: GetV1BodyMeasurementsQueryParams,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.getV1BodyMeasurements> =>
			api.getV1BodyMeasurements(
				headers,
				params,
				requestOptions(options, client),
			),
		getBodyMeasurement: (
			date: string,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.getV1BodyMeasurementsDate> =>
			api.getV1BodyMeasurementsDate(
				date,
				headers,
				requestOptions(options, client),
			),
		createBodyMeasurement: (
			data: PostV1BodyMeasurementsMutationRequest,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.postV1BodyMeasurements> =>
			api.postV1BodyMeasurements(
				data,
				headers,
				requestOptions(options, client),
			),
		updateBodyMeasurement: (
			date: string,
			data: PutV1BodyMeasurementsDateMutationRequest,
			options?: HevyRequestOptions,
		): ReturnType<typeof api.putV1BodyMeasurementsDate> =>
			api.putV1BodyMeasurementsDate(
				date,
				data,
				headers,
				requestOptions(options, client),
			),
		getUserInfo: (
			options?: HevyRequestOptions,
		): ReturnType<typeof api.getV1UserInfo> =>
			api.getV1UserInfo(headers, requestOptions(options, client)),
	};
}
