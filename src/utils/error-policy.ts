import {
	HEVY_REQUEST_ABORTED_ERROR_CODE,
	HEVY_RETRY_EXHAUSTED_ERROR_CODE,
	isHevyHttpError,
} from "./hevy-http-error.js";

/** Specific error types for categorization and metrics. */
export enum ErrorType {
	API_ERROR = "API_ERROR",
	RATE_LIMIT = "RATE_LIMIT",
	VALIDATION_ERROR = "VALIDATION_ERROR",
	NOT_FOUND = "NOT_FOUND",
	NETWORK_ERROR = "NETWORK_ERROR",
	UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

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
}

type SafeSourceId =
	| "error-handler"
	| "hevy-client"
	| "index"
	| "observability-wrapper"
	| "shared-server"
	| "worker";

type RetryAwareError = {
	hevyRetryCount?: number;
	hevyRetryExhausted?: boolean;
};

const SAFE_ERROR_CODES = new Set([
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
]);

const SAFE_HTTP_METHODS = new Set([
	"DELETE",
	"GET",
	"HEAD",
	"OPTIONS",
	"PATCH",
	"POST",
	"PUT",
]);

const SAFE_ENDPOINTS = new Set([
	"unknown",
	"/v1/body_measurements",
	"/v1/body_measurements/:date",
	"/v1/exercise_history/:exerciseTemplateId",
	"/v1/exercise_templates",
	"/v1/exercise_templates/:exerciseTemplateId",
	"/v1/routine_folders",
	"/v1/routine_folders/:folderId",
	"/v1/routines",
	"/v1/routines/:routineId",
	"/v1/user/info",
	"/v1/workouts",
	"/v1/workouts/:workoutId",
	"/v1/workouts/count",
	"/v1/workouts/events",
]);

const SAFE_SOURCE_SUFFIXES: ReadonlyArray<readonly [string, SafeSourceId]> = [
	["/src/utils/error-handler.ts", "error-handler"],
	["/src/utils/hevyClientKubb.ts", "hevy-client"],
	["/src/index.ts", "index"],
	["/src/utils/observability-wrapper.ts", "observability-wrapper"],
	["/src/shared-server.ts", "shared-server"],
	["/src/worker.ts", "worker"],
];

const PROJECT_PATH_MARKER = "/hevy-mcp/";
const MAX_STACK_POSITION = 1_000_000;

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
	try {
		if (!headers || typeof headers !== "object") return undefined;

		if (
			"get" in headers &&
			typeof (headers as { get?: unknown }).get === "function"
		) {
			const value = (headers as { get: (headerName: string) => unknown }).get(
				key,
			);
			return normalizeHeaderValue(value);
		}

		const headerRecord = headers as Record<string, unknown>;
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
export function extractErrorStatus(error: unknown): number | undefined {
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
export function isRetryExhausted(error: unknown): boolean {
	try {
		return (
			!!error &&
			typeof error === "object" &&
			(error as RetryAwareError).hevyRetryExhausted === true
		);
	} catch {
		return false;
	}
}

/** Interpret a Retry-After header as seconds from the supplied current time. */
export function getRetryAfterSeconds(
	error: unknown,
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
export function getStatusErrorMessage(status?: number): string | null {
	if (status === 401 || status === 403) {
		return "The Hevy API key is invalid or has expired. Check HEVY_API_KEY.";
	}
	if (status === 404) return "The requested resource was not found in Hevy.";
	if (status === 409) {
		return "A conflict occurred (e.g., a body measurement already exists for this date). Use the update tool instead.";
	}
	if (status === 422) {
		return "The request failed Hevy validation. Check the field values and try again.";
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

function getRateLimitMessage(error: unknown): string {
	const seconds = getRetryAfterSeconds(error);
	if (seconds !== undefined) {
		return `Rate limited by Hevy (HTTP 429). Please wait about ${formatSecondsLabel(seconds)} before retrying.`;
	}
	return "Rate limited by Hevy (HTTP 429). Please wait and retry your request.";
}

function getRetryExhaustedMessage(error: unknown): string {
	let retryCount: unknown;
	try {
		retryCount =
			typeof error === "object" && error !== null
				? (error as RetryAwareError).hevyRetryCount
				: undefined;
	} catch {
		retryCount = undefined;
	}
	const attemptCount =
		typeof retryCount === "number" && Number.isFinite(retryCount)
			? retryCount + 1
			: undefined;
	if (attemptCount) {
		return `Unable to complete the request after ${attemptCount} attempts to the Hevy API due to transient failures. Please try again shortly.`;
	}
	return "Unable to complete the request after multiple attempts to the Hevy API due to transient failures. Please try again shortly.";
}

/** Classify an error using bounded status, names, and supplied text. */
export function determineErrorType(error: unknown, message: string): ErrorType {
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

function classifyError(error: unknown): SafeErrorCategory {
	if (isHevyHttpError(error)) return "HevyHttpError";
	if (error instanceof TypeError) return "TypeError";
	if (error instanceof RangeError) return "RangeError";
	if (error instanceof ReferenceError) return "ReferenceError";
	if (error instanceof SyntaxError) return "SyntaxError";
	if (error instanceof URIError) return "URIError";
	if (error instanceof EvalError) return "EvalError";
	if (error instanceof AggregateError) return "AggregateError";
	if (typeof DOMException !== "undefined" && error instanceof DOMException) {
		return "DOMException";
	}
	if (error instanceof Error) return "Error";
	return "UnknownError";
}

function getSafeCode(error: unknown): string | undefined {
	if (!error || typeof error !== "object" || !("code" in error)) {
		return undefined;
	}
	const code = error.code;
	return typeof code === "string" && SAFE_ERROR_CODES.has(code)
		? code
		: undefined;
}

function getSafeMethod(error: unknown): string | undefined {
	if (!isHevyHttpError(error)) return undefined;
	const method = error.method.toUpperCase();
	return SAFE_HTTP_METHODS.has(method) ? method : undefined;
}

function getSafeEndpoint(error: unknown): string | undefined {
	if (!isHevyHttpError(error)) return undefined;
	return SAFE_ENDPOINTS.has(error.endpoint) ? error.endpoint : undefined;
}

function parseSafeStackFrames(error: unknown): SafeStackFrame[] | undefined {
	if (!(error instanceof Error) || typeof error.stack !== "string") {
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
export function createSafeErrorDiagnostic(error: unknown): SafeErrorDiagnostic {
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
	error: unknown,
	defaultMessage: string,
	notInitializedMessage?: string,
): ErrorPolicyResult {
	const diagnostic = createSafeErrorDiagnostic(error);
	const mappedMessage = getStatusErrorMessage(diagnostic.status);
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
	}
	return { type: determineErrorType(error, message), message, diagnostic };
}
