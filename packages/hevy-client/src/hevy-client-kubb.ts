import { z } from "zod";
import { Duration, Effect, Schedule } from "effect";

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
import * as api from "./generated/client/api/index.js";
import type {
	BodyMeasurement,
	CreateCustomExerciseRequestBody,
	GetV1BodyMeasurementsQuery,
	GetV1BodyMeasurementsStatus200,
	GetV1BodyMeasurementsDateStatus200,
	GetV1ExerciseHistoryExercisetemplateidQuery,
	GetV1ExerciseHistoryExercisetemplateidStatus200,
	GetV1ExerciseTemplatesQuery,
	GetV1ExerciseTemplatesStatus200,
	GetV1ExerciseTemplatesExercisetemplateidStatus200,
	GetV1RoutineFoldersQuery,
	GetV1RoutineFoldersStatus200,
	GetV1RoutineFoldersFolderidStatus200,
	GetV1RoutinesQuery,
	GetV1RoutinesStatus200,
	GetV1RoutinesRoutineidStatus200,
	GetV1UserInfoStatus200,
	GetV1WorkoutsEventsQuery,
	GetV1WorkoutsEventsStatus200,
	GetV1WorkoutsQuery,
	GetV1WorkoutsStatus200,
	GetV1WorkoutsCountStatus200,
	GetV1WorkoutsWorkoutidStatus200,
	PostRoutineFolderRequestBody,
	PostRoutinesRequestBody,
	PostWorkoutsRequestBody,
	PostV1BodyMeasurementsStatus200,
	PostV1ExerciseTemplatesStatus200,
	PostV1RoutineFoldersStatus201,
	PostV1WorkoutsStatus201,
	PutBodyMeasurement,
	PutRoutinesRequestBody,
	PutV1BodyMeasurementsDateStatus200,
	PutV1RoutinesRoutineidStatus200,
	PutV1WorkoutsWorkoutidStatus200,
	Routine,
} from "./generated/client/types/index.js";
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
import { DEFAULT_RETRY_POLICY } from "./retry-policy.js";
import { createRetrySchedule } from "./retry-schedule.js";
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
	readonly hevyTimeoutMs?: number;
};
type MutableRequest = {
	hevyDeadline?: number;
	hevyTimeoutMs?: number;
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
export { RETRY_BACKOFF_BASE_MS } from "./retry-policy.js";
export { HEVY_RETRY_EXHAUSTED_ERROR_CODE };
export { HEVY_REQUEST_ABORTED_ERROR_CODE };
export { HEVY_DEADLINE_EXCEEDED_ERROR_CODE };

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
	query?: unknown;
}) {
	const method = (config.method ?? "GET").toUpperCase();
	const endpoint = canonicalEndpointIdentity(config.url ?? "");
	const query = config.query ?? config.params;
	const page =
		query !== null && isObject(query) && "page" in query && isNumber(query.page)
			? query.page
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

function boundedRandomInt(maxExclusive: number): number {
	if (maxExclusive <= 1) return 0;
	const random = new Uint32Array(1);
	const cryptoApi = (
		globalThis as typeof globalThis & {
			crypto: { getRandomValues(values: Uint32Array): Uint32Array };
		}
	).crypto;
	cryptoApi.getRandomValues(random);
	return Math.floor((random[0] / 2 ** 32) * maxExclusive);
}

function buildUrl(baseUrl: string, config: RequestConfig<unknown>): URL {
	if (!config.url?.startsWith("/v1/")) {
		throw new HevyHttpError("Invalid Hevy API endpoint", {
			method: config.method ?? "GET",
			endpoint: "unknown",
			code: "HEVY_INVALID_ENDPOINT",
		});
	}
	let resolvedUrl = config.url;
	if (config.path && isObject(config.path)) {
		for (const [key, value] of Object.entries(config.path)) {
			if (value !== undefined) {
				resolvedUrl = resolvedUrl.replaceAll(
					`{${key}}`,
					encodeURIComponent(value === null ? "null" : String(value)),
				);
			}
		}
	}
	const url = new URL(resolvedUrl, baseUrl);
	const query = config.query ?? config.params;
	if (query && isObject(query)) {
		for (const [key, value] of Object.entries(query)) {
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
	callerCanceled?: boolean;
	responseConfirmed?: boolean;
	code?: string;
	cause?: unknown;
}

interface ExecutionFailureState {
	deadlineExceeded: boolean;
	canceled: boolean;
	callerCanceled: boolean;
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

	const callerCanceled = executionSignal.aborted && !deadlineExceeded;
	return {
		deadlineExceeded,
		canceled: callerCanceled,
		callerCanceled,
		attemptTimedOut,
	};
}

function createExecutionError(options: ExecutionErrorOptions): HevyHttpError {
	const { deadlineExceeded, canceled, callerCanceled = false } = options;
	return new HevyHttpError(
		deadlineExceeded
			? "Hevy API request deadline exceeded"
			: callerCanceled
				? "The request was canceled by the client."
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
	if (options?.timeoutMs !== undefined)
		request.hevyTimeoutMs = options.timeoutMs;
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
	/** Deadline for this attempt; each retry receives a fresh timeout window. */
	attemptDeadline: number;
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
				const payload = options.normalized.body ?? options.normalized.data;
				const headers = new Headers({ "api-key": options.apiKey });
				if (payload !== undefined && !(payload instanceof FormData)) {
					headers.set("content-type", "application/json");
				}
				const requestInit: RequestInit = {
					method: options.method,
					headers,
					redirect: "manual",
					body:
						payload instanceof FormData
							? payload
							: payload === undefined
								? undefined
								: JSON.stringify(payload),
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
					remainingDeadlineMs(options.attemptDeadline),
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
					remainingDeadlineMs(options.attemptDeadline),
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
	/** Overall operation deadline used for cancellation and retry backoff. */
	deadline: number;
	/** Deadline of the attempt that just failed. */
	attemptDeadline: number;
	retryCount: number;
	maxGetRetries: number;
	/** True only while executing the one allowed fresh-budget deadline retry. */
	deadlineRetryActive?: boolean;
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
		callerCanceled: failure.callerCanceled,
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
	if (options.deadlineRetryActive) return false;
	const deadlineRetry =
		options.safety === "read" &&
		options.retryCount === 0 &&
		options.maxGetRetries > 0;
	if (
		failure.deadlineExceeded ||
		error.code === HEVY_DEADLINE_EXCEEDED_ERROR_CODE
	) {
		return deadlineRetry;
	}
	return (
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

async function createRetryTransition(
	options: AttemptFailureTransitionOptions,
	error: HevyHttpError,
	retryDelayStep: (
		now: number,
		input: Pick<HevyHttpError, "status" | "headers">,
	) => Promise<[number, Duration.Duration]>,
): Promise<AttemptFailureTransition> {
	const retryCount = options.retryCount + 1;
	const [, delay] = await retryDelayStep(Date.now(), error);
	const delayMs = Duration.toMillis(delay);
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
async function transitionAfterAttemptFailure(
	options: AttemptFailureTransitionOptions,
	retryDelayStep: (
		now: number,
		input: Pick<HevyHttpError, "status" | "headers">,
	) => Promise<[number, Duration.Duration]>,
): Promise<AttemptFailureTransition> {
	const failure = classifyExecutionFailure(
		options.cause,
		options.executionSignal.signal,
		options.attemptDeadline,
		options.executionSignal.deadlineTriggered() ||
			isDeadlineExceeded(options.attemptDeadline),
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
	return createRetryTransition(options, error, retryDelayStep);
}

function createNativeClient(
	apiKey: string,
	baseUrl: string,
	options: HevyClientOptions,
): KubbClient {
	const fetchImplementation = options.fetch ?? globalThis.fetch;
	const maxGetRetries = normalizeMaxGetRetries(options.maxGetRetries);
	const scheduleStep = Effect.runSync(
		Schedule.toStep(
			createRetrySchedule(
				maxGetRetries,
				DEFAULT_RETRY_POLICY,
				boundedRandomInt,
			),
		),
	);
	const retryDelayStep = (
		now: number,
		input: Pick<HevyHttpError, "status" | "headers">,
	) => Effect.runPromise(scheduleStep(now, input));
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
		// `timeoutMs` is the default per-attempt budget. The overall operation
		// deadline expands to accommodate all retries. A read may get one
		// fresh attempt budget after timing out, bounded by `operationDeadline`.
		// An explicit caller deadline remains authoritative — no retry extends
		// beyond it, so the deadline retry is disabled in that case.
		const operationTimeoutMs = normalizePositiveInteger(
			normalized.hevyTimeoutMs,
			timeoutMs,
		);
		const operationStartedAt = Date.now();
		let deadline =
			normalized.hevyDeadline ??
			operationStartedAt + operationTimeoutMs * (maxGetRetries + 1);
		const operationDeadline =
			normalized.hevyDeadline ?? deadline + operationTimeoutMs;
		let executionSignal = createExecutionSignal({
			signal: normalized.signal,
			deadline,
		});
		let retryCount = 0;
		let deadlineRetryActive = false;

		try {
			while (true) {
				const attemptDeadline = Math.min(
					deadline,
					Date.now() + operationTimeoutMs,
				);
				const remaining = remainingDeadlineMs(attemptDeadline);
				if (executionSignal.signal.aborted || remaining <= 0) {
					const deadlineExceeded = remaining <= 0;
					const error = createExecutionError({
						method,
						endpoint,
						safety,
						phase: "before-dispatch",
						deadlineExceeded,
						canceled: !deadlineExceeded,
						callerCanceled: !deadlineExceeded && executionSignal.signal.aborted,
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
					attemptDeadline,
					executionSignal: executionSignal.signal,
					startedAt,
					retryCount,
					observationScope,
					onRequestComplete: options.onRequestComplete,
				});
				if (attempt.ok) return attempt.result;
				{
					const { cause, phase, responseConfirmed } = attempt;
					const transition = await transitionAfterAttemptFailure(
						{
							cause,
							method,
							endpoint,
							page,
							safety,
							phase,
							responseConfirmed,
							executionSignal,
							deadline,
							attemptDeadline,
							retryCount,
							maxGetRetries,
							deadlineRetryActive,
							startedAt,
							observationScope,
							clientOptions: options,
						},
						retryDelayStep,
					);
					if (!transition.retry) throw transition.error;
					retryCount = transition.retryCount;
					if (transition.error.code === HEVY_DEADLINE_EXCEEDED_ERROR_CODE) {
						// Skip the deadline retry when the caller supplied an
						// explicit deadline — it is authoritative and no retry
						// may extend beyond it. In that case operationDeadline
						// equals deadline, leaving no fresh attempt budget.
						if (operationDeadline <= deadline) throw transition.error;
						executionSignal.cleanup();
						deadline = Math.min(
							Date.now() + operationTimeoutMs,
							operationDeadline,
						);
						executionSignal = createExecutionSignal({
							signal: normalized.signal,
							deadline,
						});
						deadlineRetryActive = true;
						continue;
					}
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
							callerCanceled:
								!waitDeadlineExceeded && executionSignal.signal.aborted,
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
		getWorkouts: async (
			params?: GetV1WorkoutsQuery,
			options?: HevyRequestOptions,
		): Promise<GetV1WorkoutsStatus200> => {
			const res = await api.getV1Workouts({
				headers,
				query: params,
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		getWorkout: async (
			workoutId: string,
			options?: HevyRequestOptions,
		): Promise<GetV1WorkoutsWorkoutidStatus200> => {
			const res = await api.getV1WorkoutsWorkoutid({
				headers,
				path: { workoutId },
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		createWorkout: async (
			data: PostWorkoutsRequestBody,
			options?: HevyRequestOptions,
		): Promise<PostV1WorkoutsStatus201> => {
			const res = await api.postV1Workouts({
				headers,
				body: data,
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		updateWorkout: async (
			workoutId: string,
			data: PostWorkoutsRequestBody,
			options?: HevyRequestOptions,
		): Promise<PutV1WorkoutsWorkoutidStatus200> => {
			const res = await api.putV1WorkoutsWorkoutid({
				headers,
				path: { workoutId },
				body: data,
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		getWorkoutCount: async (
			options?: HevyRequestOptions,
		): Promise<GetV1WorkoutsCountStatus200> => {
			const res = await api.getV1WorkoutsCount({
				headers,
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		getWorkoutEvents: async (
			params?: GetV1WorkoutsEventsQuery,
			options?: HevyRequestOptions,
		): Promise<GetV1WorkoutsEventsStatus200> => {
			const res = await api.getV1WorkoutsEvents({
				headers,
				query: params,
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		getRoutines: async (
			params?: GetV1RoutinesQuery,
			options?: HevyRequestOptions,
		): Promise<GetV1RoutinesStatus200> => {
			const res = await api.getV1Routines({
				headers,
				query: params,
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		getRoutineById: async (
			routineId: string,
			options?: HevyRequestOptions,
		): Promise<GetV1RoutinesRoutineidStatus200> => {
			const res = await api.getV1RoutinesRoutineid({
				headers,
				path: { routineId },
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		createRoutine: async (
			data: PostRoutinesRequestBody,
			options?: HevyRequestOptions,
		): Promise<Routine | undefined> => {
			const res = await api.postV1Routines({
				headers,
				body: data,
				...(requestOptions(options, client) as any),
			});
			const response = res.data;
			return Object.keys(response).length === 0
				? undefined
				: (response as Routine);
		},
		updateRoutine: async (
			routineId: string,
			data: PutRoutinesRequestBody,
			options?: HevyRequestOptions,
		): Promise<PutV1RoutinesRoutineidStatus200> => {
			const res = await api.putV1RoutinesRoutineid({
				headers,
				path: { routineId },
				body: data,
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		getExerciseTemplates: async (
			params?: GetV1ExerciseTemplatesQuery,
			options?: HevyRequestOptions,
		): Promise<GetV1ExerciseTemplatesStatus200> => {
			const res = await api.getV1ExerciseTemplates({
				headers,
				query: params,
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		getExerciseTemplate: async (
			templateId: string,
			options?: HevyRequestOptions,
		): Promise<GetV1ExerciseTemplatesExercisetemplateidStatus200> => {
			const res = await api.getV1ExerciseTemplatesExercisetemplateid({
				headers,
				path: { exerciseTemplateId: templateId },
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		getExerciseHistory: async (
			exerciseTemplateId: string,
			params?: GetV1ExerciseHistoryExercisetemplateidQuery,
			options?: HevyRequestOptions,
		): Promise<GetV1ExerciseHistoryExercisetemplateidStatus200> => {
			const res = await api.getV1ExerciseHistoryExercisetemplateid({
				headers,
				path: { exerciseTemplateId },
				query: params,
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		createExerciseTemplate: async (
			data: CreateCustomExerciseRequestBody,
			options?: HevyRequestOptions,
		): Promise<PostV1ExerciseTemplatesStatus200> => {
			const res = await api.postV1ExerciseTemplates({
				headers,
				body: data,
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		getRoutineFolders: async (
			params?: GetV1RoutineFoldersQuery,
			options?: HevyRequestOptions,
		): Promise<GetV1RoutineFoldersStatus200> => {
			const res = await api.getV1RoutineFolders({
				headers,
				query: params,
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		createRoutineFolder: async (
			data: PostRoutineFolderRequestBody,
			options?: HevyRequestOptions,
		): Promise<PostV1RoutineFoldersStatus201> => {
			const res = await api.postV1RoutineFolders({
				headers,
				body: data,
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		getRoutineFolder: async (
			folderId: string,
			options?: HevyRequestOptions,
		): Promise<GetV1RoutineFoldersFolderidStatus200> => {
			const res = await api.getV1RoutineFoldersFolderid({
				headers,
				path: { folderId },
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		getBodyMeasurements: async (
			params?: GetV1BodyMeasurementsQuery,
			options?: HevyRequestOptions,
		): Promise<GetV1BodyMeasurementsStatus200> => {
			const res = await api.getV1BodyMeasurements({
				headers,
				query: params,
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		getBodyMeasurement: async (
			date: string,
			options?: HevyRequestOptions,
		): Promise<GetV1BodyMeasurementsDateStatus200> => {
			const res = await api.getV1BodyMeasurementsDate({
				headers,
				path: { date },
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		createBodyMeasurement: async (
			data: BodyMeasurement,
			options?: HevyRequestOptions,
		): Promise<PostV1BodyMeasurementsStatus200> => {
			const res = await api.postV1BodyMeasurements({
				headers,
				body: data,
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		updateBodyMeasurement: async (
			date: string,
			data: PutBodyMeasurement,
			options?: HevyRequestOptions,
		): Promise<PutV1BodyMeasurementsDateStatus200> => {
			const res = await api.putV1BodyMeasurementsDate({
				headers,
				path: { date },
				body: data,
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
		getUserInfo: async (
			options?: HevyRequestOptions,
		): Promise<GetV1UserInfoStatus200> => {
			const res = await api.getV1UserInfo({
				headers,
				...(requestOptions(options, client) as any),
			});
			return res.data;
		},
	};
}
