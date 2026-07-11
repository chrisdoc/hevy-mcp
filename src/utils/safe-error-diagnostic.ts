import {
	HEVY_REQUEST_ABORTED_ERROR_CODE,
	HEVY_RETRY_EXHAUSTED_ERROR_CODE,
	isHevyHttpError,
} from "./hevy-http-error.js";

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

function getSafeStatus(error: unknown): number | undefined {
	if (!isHevyHttpError(error)) return undefined;
	return error.status !== undefined &&
		Number.isInteger(error.status) &&
		error.status >= 100 &&
		error.status <= 599
		? error.status
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
	for (const frameLine of error.stack.split("\n").slice(1)) {
		const match =
			/^\s{4}at (?:[^()\r\n]+ \()?([^()\s\r\n]+):(\d+):(\d+)\)?$/.exec(
				frameLine,
			);
		if (!match) continue;
		const [, rawSource, rawLine, rawColumn] = match;
		if (!rawSource || !rawLine || !rawColumn) continue;
		const source = SAFE_SOURCE_SUFFIXES.find(([suffix]) =>
			rawSource.endsWith(suffix),
		)?.[1];
		if (!source) continue;
		const line = Number(rawLine);
		const column = Number(rawColumn);
		if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column)) continue;
		frames.push({ source, line, column });
		if (frames.length === 3) break;
	}

	return frames.length > 0 ? frames : undefined;
}

export function createSafeErrorDiagnostic(error: unknown): SafeErrorDiagnostic {
	try {
		const diagnostic: SafeErrorDiagnostic = {
			category: classifyError(error),
		};
		const code = getSafeCode(error);
		const status = getSafeStatus(error);
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
