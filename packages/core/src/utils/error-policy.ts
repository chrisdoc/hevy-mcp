import {
	diagnosticEndpointIdentity,
	HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
	HEVY_REQUEST_ABORTED_ERROR_CODE,
	HEVY_RETRY_EXHAUSTED_ERROR_CODE,
	isHevyHttpError,
} from "@hevy-mcp/hevy-client";
import {
	isBoolean,
	isFiniteNumber,
	isFunction,
	isObject,
	isString,
} from "./type-predicates.js";
import type { RuntimeValue } from "./type-predicates.js";
import { SafeUserError } from "./safe-user-error.js";
import type {
	HevyCommitState,
	HevyExecutionOutcome,
	HevyOperationSafety,
	HevyRequestPhase,
} from "@hevy-mcp/hevy-client";

/** Specific error types for categorization and metrics. */
export enum ErrorType {
	API_ERROR = "API_ERROR",
	RATE_LIMIT = "RATE_LIMIT",
	VALIDATION_ERROR = "VALIDATION_ERROR",
	NOT_FOUND = "NOT_FOUND",
	NETWORK_ERROR = "NETWORK_ERROR",
	UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

type HeaderValue = string | number | string[] | undefined;
type HeaderMap = { [key: string]: HeaderValue };

export type SafeErrorCategory =
	| "AggregateError"
	| "DOMException"
	| "Error"
	| "EvalError"
	| "HevyHttpError"
	| "RangeError"
	| "ReferenceError"
	| "SyntaxError"
	| "TypeError"
	| "URIError"
	| "UnknownError";

export interface SafeStackFrame {
	source: SafeSourceId;
	line: number;
	column: number;
}

export interface SafeErrorDiagnostic {
	category: SafeErrorCategory;
	code?: string;
	status?: number;
	method?: string;
	endpoint?: string;
	frames?: SafeStackFrame[];
	phase?: HevyRequestPhase;
	operation_safety?: HevyOperationSafety;
	commit_state?: HevyCommitState;
	safe_to_retry?: boolean;
	outcome?: HevyExecutionOutcome;
}

type SafeSourceId =
	| "error-handler"
	| "hevy-client"
	| "index"
	| "server"
	| "worker";

/** Categories createSafeErrorDiagnostic may emit; part of the module's interface. */
export const SAFE_ERROR_CATEGORIES: ReadonlySet<SafeErrorCategory> =
	Object.freeze(
		new Set<SafeErrorCategory>([
			"AggregateError",
			"DOMException",
			"Error",
			"EvalError",
			"HevyHttpError",
			"RangeError",
			"ReferenceError",
			"SyntaxError",
			"TypeError",
			"URIError",
			"UnknownError",
		]),
	);

type RetryAwareError = {
	hevyRetryCount?: number;
	hevyRetryExhausted?: boolean;
};

const ABORT_TIMEOUT_METADATA = {
	AbortError: {
		code: HEVY_REQUEST_ABORTED_ERROR_CODE,
		outcome: "cancelled" as const,
	},
	TimeoutError: {
		code: HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
		outcome: "deadline_exceeded" as const,
	},
} as const;

type AbortTimeoutErrorMetadata =
	(typeof ABORT_TIMEOUT_METADATA)[keyof typeof ABORT_TIMEOUT_METADATA] & {
		name: keyof typeof ABORT_TIMEOUT_METADATA;
	};

/** Map raw cancellation errors to their bounded execution metadata. */
function getAbortTimeoutErrorMetadata(
	error: RuntimeValue,
): AbortTimeoutErrorMetadata | undefined {
	try {
		if (!(error instanceof Error)) return undefined;
		const name = error.name as keyof typeof ABORT_TIMEOUT_METADATA;
		const metadata = ABORT_TIMEOUT_METADATA[name];
		return metadata ? { name, ...metadata } : undefined;
	} catch {
		return undefined;
	}
}

/** Bounded error codes diagnostics may carry; adapters validate against this. */
export const SAFE_ERROR_CODES: ReadonlySet<string> = Object.freeze(
	new Set([
		"EAI_AGAIN",
		"ECONNABORTED",
		"ECONNREFUSED",
		"ECONNRESET",
		"ENETUNREACH",
		"ENOTFOUND",
		"ERR_NETWORK",
		"ERR_SOCKET_TIMEOUT",
		"ETIMEDOUT",
		"HEVY_INVALID_ENDPOINT",
		HEVY_REQUEST_ABORTED_ERROR_CODE,
		HEVY_RETRY_EXHAUSTED_ERROR_CODE,
		HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
	]),
);

/** Bounded HTTP methods diagnostics may carry. */
export const SAFE_HTTP_METHODS: ReadonlySet<string> = Object.freeze(
	new Set(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]),
);

const SAFE_SOURCE_SUFFIXES: ReadonlyArray<readonly [string, SafeSourceId]> = [
	["/packages/core/src/utils/error-handler.ts", "error-handler"],
	["/packages/hevy-client/src/hevy-client-kubb.ts", "hevy-client"],
	["/packages/node/src/index.ts", "index"],
	["/packages/core/src/server.ts", "server"],
	["/packages/worker/src/worker.ts", "worker"],
];

const PROJECT_PATH_MARKER = "/hevy-mcp/";

/** Stack-frame sources diagnostics may name; adapters validate against this. */
export const SAFE_STACK_SOURCES: ReadonlySet<SafeSourceId> = Object.freeze(
	new Set(SAFE_SOURCE_SUFFIXES.map(([, id]) => id)),
);
const MAX_STACK_POSITION = 1_000_000;

function normalizeHeaderValue(value: RuntimeValue): string | undefined {
	if (isString(value)) {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}

	if (isFiniteNumber(value)) {
		return String(value);
	}

	if (Array.isArray(value) && value.length > 0) {
		return normalizeHeaderValue(value[0]);
	}

	return undefined;
}

function getHeaderValue(
	headers: RuntimeValue,
	key: string,
): string | undefined {
	try {
		if (!isObject(headers)) return undefined;

		if ("get" in headers && isFunction((headers as { get?: unknown }).get)) {
			const value = (headers as { get: (headerName: string) => unknown }).get(
				key,
			);
			return normalizeHeaderValue(value);
		}

		const headerRecord = headers as HeaderMap;
		return normalizeHeaderValue(
			headerRecord[key] ??
				headerRecord[key.toLowerCase()] ??
				headerRecord[key.toUpperCase()],
		);
	} catch {
		return undefined;
	}
}

/** Extract a valid HTTP status without retaining untrusted error metadata. */
export function extractErrorStatus(error: RuntimeValue): number | undefined {
	try {
		if (!isHevyHttpError(error)) return undefined;
		return error.status !== undefined &&
			Number.isInteger(error.status) &&
			error.status >= 100 &&
			error.status <= 599
			? error.status
			: undefined;
	} catch {
		return undefined;
	}
}

/** Return whether the client exhausted its bounded transient retry policy. */
export function isRetryExhausted(error: RuntimeValue): boolean {
	try {
		return (
			!!error &&
			isObject(error) &&
			(error as RetryAwareError).hevyRetryExhausted === true
		);
	} catch {
		return false;
	}
}

/** Interpret a Retry-After header as seconds from the supplied current time. */
export function getRetryAfterSeconds(
	error: RuntimeValue,
	now = Date.now(),
): number | undefined {
	try {
		if (!isHevyHttpError(error)) return undefined;
		const retryAfterHeader = getHeaderValue(error.headers, "retry-after");
		if (!retryAfterHeader) return undefined;

		const seconds = Number(retryAfterHeader);
		if (Number.isFinite(seconds) && seconds >= 0) return seconds;

		const retryAtMillis = Date.parse(retryAfterHeader);
		if (Number.isNaN(retryAtMillis)) return undefined;
		return Math.ceil(Math.max(0, retryAtMillis - now) / 1000);
	} catch {
		return undefined;
	}
}

/** Map bounded Hevy HTTP statuses to stable user-facing messages. */
export function getStatusErrorMessage(
	status?: number,
	method?: string,
	endpoint?: string,
): string | null {
	if (
		status === 404 &&
		method?.toUpperCase() === "PUT" &&
		endpoint === "/v1/routines/:routineId"
	) {
		return "The requested routine was not found in Hevy. It may have been deleted or the routine ID is incorrect.";
	}
	if (status === 400 || status === 422) {
		return "The request failed Hevy validation. Check the field values and try again.";
	}
	if (status === 401 || status === 403) {
		return "The Hevy API key is invalid or has expired. Check HEVY_API_KEY.";
	}
	if (status === 404) return "The requested resource was not found in Hevy.";
	if (status === 409) {
		return "A conflict occurred because the resource already exists or conflicts with the current server state. Check whether it already exists and use the update tool when appropriate.";
	}
	if (status === 429) return "Rate limited by Hevy. Please wait and retry.";
	if (status !== undefined && status >= 500 && status <= 599) {
		return "Hevy API experienced an error. Please retry later.";
	}
	return null;
}

function formatSecondsLabel(seconds: number): string {
	const roundedSeconds = Math.max(0, Math.round(seconds));
	const suffix = roundedSeconds === 1 ? "" : "s";
	return `${roundedSeconds} second${suffix}`;
}

function getRateLimitMessage(error: RuntimeValue): string {
	const seconds = getRetryAfterSeconds(error);
	if (seconds !== undefined) {
		return `Rate limited by Hevy (HTTP 429). Please wait about ${formatSecondsLabel(seconds)} before retrying.`;
	}
	return "Rate limited by Hevy (HTTP 429). Please wait and retry your request.";
}

function getRetryExhaustedMessage(error: RuntimeValue): string {
	let retryCount: unknown;
	try {
		retryCount = isObject(error)
			? (error as RetryAwareError).hevyRetryCount
			: undefined;
	} catch {
		retryCount = undefined;
	}
	const attemptCount = isFiniteNumber(retryCount) ? retryCount + 1 : undefined;
	if (attemptCount) {
		return `Unable to complete the request after ${attemptCount} attempts to the Hevy API due to transient failures. Please try again shortly.`;
	}
	return "Unable to complete the request after multiple attempts to the Hevy API due to transient failures. Please try again shortly.";
}

const MAX_SAFE_USER_ERROR_LENGTH = 512;

/** Classify an error using bounded status, names, and supplied text. */
export function determineErrorType(
	error: RuntimeValue,
	message: string,
): ErrorType {
	if (isRetryExhausted(error)) return ErrorType.NETWORK_ERROR;
	if (extractErrorStatus(error) === 429) return ErrorType.RATE_LIMIT;

	let originalMessage = "";
	let nameLower = "";
	try {
		if (error instanceof Error) {
			originalMessage = error.message.slice(0, 512);
			nameLower = error.name.toLowerCase();
		}
	} catch {
		originalMessage = "";
		nameLower = "";
	}
	const classificationText = `${message}\n${originalMessage}`.toLowerCase();

	if (
		nameLower.includes("network") ||
		classificationText.includes("network") ||
		classificationText.includes("fetch") ||
		classificationText.includes("timeout")
	) {
		return ErrorType.NETWORK_ERROR;
	}
	if (
		nameLower.includes("validation") ||
		classificationText.includes("validation") ||
		classificationText.includes("invalid") ||
		classificationText.includes("required")
	) {
		return ErrorType.VALIDATION_ERROR;
	}
	if (
		classificationText.includes("not found") ||
		classificationText.includes("404") ||
		classificationText.includes("does not exist")
	) {
		return ErrorType.NOT_FOUND;
	}
	if (
		nameLower.includes("api") ||
		classificationText.includes("api") ||
		classificationText.includes("server error") ||
		classificationText.includes("500")
	) {
		return ErrorType.API_ERROR;
	}
	return ErrorType.UNKNOWN_ERROR;
}

function classifyError(error: RuntimeValue): SafeErrorCategory {
	if (isHevyHttpError(error)) return "HevyHttpError";
	if (error instanceof TypeError) return "TypeError";
	if (error instanceof RangeError) return "RangeError";
	if (error instanceof ReferenceError) return "ReferenceError";
	if (error instanceof SyntaxError) return "SyntaxError";
	if (error instanceof URIError) return "URIError";
	if (error instanceof EvalError) return "EvalError";
	if (error instanceof AggregateError) return "AggregateError";
	if (error instanceof DOMException) {
		return "DOMException";
	}
	if (error instanceof Error) return "Error";
	return "UnknownError";
}

function getSafeCode(error: RuntimeValue): string | undefined {
	const abortTimeout = getAbortTimeoutErrorMetadata(error);
	if (abortTimeout) return abortTimeout.code;
	if (!isObject(error) || !("code" in error)) {
		return undefined;
	}
	const code = error.code;
	return isString(code) && SAFE_ERROR_CODES.has(code) ? code : undefined;
}

function getSafeMethod(error: RuntimeValue): string | undefined {
	if (!isHevyHttpError(error)) return undefined;
	const method = error.method.toUpperCase();
	return SAFE_HTTP_METHODS.has(method) ? method : undefined;
}

function getSafeEndpoint(error: RuntimeValue): string | undefined {
	if (!isHevyHttpError(error)) return undefined;
	return diagnosticEndpointIdentity(error.endpoint);
}

function getExecutionFields(
	error: RuntimeValue,
): Pick<
	SafeErrorDiagnostic,
	"phase" | "operation_safety" | "commit_state" | "safe_to_retry" | "outcome"
> {
	if (!isHevyHttpError(error)) {
		const abortTimeout = getAbortTimeoutErrorMetadata(error);
		if (abortTimeout) {
			return {
				commit_state: "unknown",
				safe_to_retry: false,
				outcome: abortTimeout.outcome,
			};
		}
		return {};
	}
	const fields: Partial<
		Pick<
			SafeErrorDiagnostic,
			| "phase"
			| "operation_safety"
			| "commit_state"
			| "safe_to_retry"
			| "outcome"
		>
	> = {};
	if (error.phase) fields.phase = error.phase;
	if (error.operation_safety) fields.operation_safety = error.operation_safety;
	if (error.commit_state) fields.commit_state = error.commit_state;
	if (isBoolean(error.safe_to_retry))
		fields.safe_to_retry = error.safe_to_retry;
	if (error.outcome) fields.outcome = error.outcome;
	return fields;
}

function parseSafeStackFrames(
	error: RuntimeValue,
): SafeStackFrame[] | undefined {
	if (!(error instanceof Error) || !isString(error.stack)) {
		return undefined;
	}

	const frames: SafeStackFrame[] = [];
	for (const frameLine of error.stack.split(/\r?\n/).slice(1)) {
		const match =
			/^\s{4}at (?:[^()\r\n]+ \()?([^()\s\r\n]+):(\d+):(\d+)\)?$/.exec(
				frameLine,
			);
		if (!match) continue;
		const [, rawSource, rawLine, rawColumn] = match;
		if (!rawSource || !rawLine || !rawColumn) continue;
		if (
			rawSource.includes("?") ||
			rawSource.includes("#") ||
			(!rawSource.startsWith("/") && !rawSource.startsWith("file:///")) ||
			!rawSource.includes(PROJECT_PATH_MARKER)
		) {
			continue;
		}
		const source = SAFE_SOURCE_SUFFIXES.find(([suffix]) =>
			rawSource.endsWith(suffix),
		)?.[1];
		if (!source) continue;
		const line = Number(rawLine);
		const column = Number(rawColumn);
		if (
			!Number.isSafeInteger(line) ||
			!Number.isSafeInteger(column) ||
			line < 1 ||
			column < 1 ||
			line > MAX_STACK_POSITION ||
			column > MAX_STACK_POSITION
		) {
			continue;
		}
		frames.push({ source, line, column });
		if (frames.length === 3) break;
	}
	return frames.length > 0 ? frames : undefined;
}

/** Build bounded diagnostic metadata with no raw messages, payloads, or URLs. */
export function createSafeErrorDiagnostic(
	error: RuntimeValue,
): SafeErrorDiagnostic {
	try {
		const diagnostic: SafeErrorDiagnostic = { category: classifyError(error) };
		const code = getSafeCode(error);
		const status = extractErrorStatus(error);
		const method = getSafeMethod(error);
		const endpoint = getSafeEndpoint(error);
		const frames = parseSafeStackFrames(error);
		if (code) diagnostic.code = code;
		if (status !== undefined) diagnostic.status = status;
		if (method) diagnostic.method = method;
		if (endpoint) diagnostic.endpoint = endpoint;
		if (frames) diagnostic.frames = frames;
		Object.assign(diagnostic, getExecutionFields(error));
		return diagnostic;
	} catch {
		return { category: "UnknownError" };
	}
}

export interface ErrorPolicyResult {
	type: ErrorType;
	message: string;
	diagnostic: SafeErrorDiagnostic;
}

/** Resolve all bounded policy outputs used by MCP, telemetry, and reporting adapters. */
export function resolveErrorPolicy(
	error: RuntimeValue,
	defaultMessage: string,
	notInitializedMessage?: string,
): ErrorPolicyResult {
	const diagnostic = createSafeErrorDiagnostic(error);
	const mappedMessage = getStatusErrorMessage(
		diagnostic.status,
		diagnostic.method,
		diagnostic.endpoint,
	);
	let message =
		mappedMessage ??
		(diagnostic.status !== undefined
			? `Hevy API request failed (HTTP ${diagnostic.status}).`
			: defaultMessage);
	let isNotInitialized = false;
	try {
		isNotInitialized =
			Boolean(notInitializedMessage) &&
			error instanceof Error &&
			error.message === notInitializedMessage;
	} catch {
		isNotInitialized = false;
	}
	if (isNotInitialized) {
		message = notInitializedMessage ?? defaultMessage;
	} else if (isRetryExhausted(error)) {
		message = getRetryExhaustedMessage(error);
	} else if (diagnostic.status === 429) {
		message = getRateLimitMessage(error);
	} else if (
		diagnostic.status === undefined &&
		error instanceof SafeUserError &&
		error.message &&
		error.message !== notInitializedMessage
	) {
		message = error.message.slice(0, MAX_SAFE_USER_ERROR_LENGTH);
	}
	return { type: determineErrorType(error, message), message, diagnostic };
}
