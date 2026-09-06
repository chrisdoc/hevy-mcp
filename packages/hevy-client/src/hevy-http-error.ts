import type {
	HevyCommitState,
	HevyExecutionOutcome,
	HevyOperationSafety,
	HevyRequestPhase,
} from "./execution.js";
import {
	extractSafeResponseError,
	sanitizeResponseErrorText,
} from "./response-error.js";

export const HEVY_RETRY_EXHAUSTED_ERROR_CODE = "HEVY_RETRY_EXHAUSTED";
export const HEVY_REQUEST_ABORTED_ERROR_CODE = "HEVY_REQUEST_ABORTED";
export const HEVY_DEADLINE_EXCEEDED_ERROR_CODE = "HEVY_DEADLINE_EXCEEDED";

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
	HEVY_DEADLINE_EXCEEDED_ERROR_CODE,
]);

export interface HevyHttpErrorOptions {
	status?: number;
	statusText?: string;
	data?: unknown;
	headers?: Headers;
	method: string;
	endpoint: string;
	code?: string;
	cause?: unknown;
	/** Request credentials to redact from caller-provided diagnostics. */
	redact?: readonly string[];
	/** Already-sanitized response diagnostic used when rebinding an error. */
	responseError?: string;
	phase?: HevyRequestPhase;
	operationSafety?: HevyOperationSafety;
	commitState?: HevyCommitState;
	safeToRetry?: boolean;
	outcome?: HevyExecutionOutcome;
}

export interface HevyExecutionMetadata {
	phase?: HevyRequestPhase;
	operationSafety?: HevyOperationSafety;
	commitState?: HevyCommitState;
	safeToRetry?: boolean;
	outcome?: HevyExecutionOutcome;
}

/** Sanitized HTTP error that never contains credentials or full request URLs. */
export class HevyHttpError extends Error {
	readonly status?: number;
	/** Kept for source compatibility, but never retains untrusted status text. */
	readonly statusText?: string;
	/** Response bodies are intentionally not retained on public errors. */
	readonly data?: unknown;
	readonly responseError?: string;
	/** Only the safe Retry-After response header is retained. */
	readonly headers?: Headers;
	readonly method: string;
	readonly endpoint: string;
	phase?: HevyRequestPhase;
	operationSafety?: HevyOperationSafety;
	commitState?: HevyCommitState;
	safeToRetry?: boolean;
	outcome?: HevyExecutionOutcome;
	/** Stable snake-case aliases for adapter/protocol projections. */
	phase_name?: HevyRequestPhase;
	operation_safety?: HevyOperationSafety;
	commit_state?: HevyCommitState;
	safe_to_retry?: boolean;
	code?: string;
	hevyRetryCount?: number;
	hevyRetryExhausted?: boolean;

	constructor(message: string, options: HevyHttpErrorOptions) {
		super(sanitizeErrorMessage(message, options.redact));
		this.name = "HevyHttpError";
		this.status = options.status;
		this.statusText = undefined;
		this.data = undefined;
		this.responseError =
			options.responseError === undefined
				? extractSafeResponseError(options.data, options.redact)
				: sanitizeResponseErrorText(options.responseError, options.redact) ||
					undefined;
		this.headers = safeRetryHeaders(options.headers, options.redact);
		this.method = options.method;
		this.endpoint = options.endpoint;
		this.code = safeErrorCode(options.code);
		this.setExecutionMetadata(options);
	}

	/** Update execution fields and their protocol aliases as one lifecycle step. */
	setExecutionMetadata(metadata: HevyExecutionMetadata): void {
		this.phase = metadata.phase;
		this.phase_name = metadata.phase;
		this.operationSafety = metadata.operationSafety;
		this.operation_safety = metadata.operationSafety;
		this.commitState = metadata.commitState;
		this.commit_state = metadata.commitState;
		this.safeToRetry = metadata.safeToRetry;
		this.safe_to_retry = metadata.safeToRetry;
		this.outcome = metadata.outcome;
	}
}

function sanitizeErrorMessage(
	message: string,
	secrets: readonly string[] | undefined,
): string {
	let sanitized = sanitizeResponseErrorText(message, secrets);
	for (const secret of secrets ?? []) {
		if (secret.length > 0)
			sanitized = sanitized.split(secret).join("[REDACTED]");
	}
	return sanitized || "Hevy API request failed";
}

function safeErrorCode(code: string | undefined): string | undefined {
	return code !== undefined && SAFE_ERROR_CODES.has(code) ? code : undefined;
}

function safeRetryHeaders(
	headers: Headers | undefined,
	secrets: readonly string[] | undefined,
): Headers | undefined {
	if (!headers) return undefined;
	try {
		const retryAfter = headers.get("retry-after");
		if (retryAfter === null || retryAfter.length > 128) return undefined;
		if (
			(secrets ?? []).some(
				(secret) => secret.length > 0 && retryAfter.includes(secret),
			)
		) {
			return undefined;
		}
		const numeric = Number(retryAfter);
		if (
			(Number.isFinite(numeric) && numeric >= 0) ||
			!Number.isNaN(Date.parse(retryAfter))
		) {
			return new Headers({ "retry-after": retryAfter });
		}
	} catch {
		// Untrusted header implementations must not affect error construction.
	}
	return undefined;
}

export function isHevyHttpError<T>(error: T): error is T & HevyHttpError {
	return error instanceof HevyHttpError;
}
