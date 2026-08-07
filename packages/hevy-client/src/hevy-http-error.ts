import type {
	HevyCommitState,
	HevyExecutionOutcome,
	HevyOperationSafety,
	HevyRequestPhase,
} from "./execution.js";

export const HEVY_RETRY_EXHAUSTED_ERROR_CODE = "HEVY_RETRY_EXHAUSTED";
export const HEVY_REQUEST_ABORTED_ERROR_CODE = "HEVY_REQUEST_ABORTED";
export const HEVY_DEADLINE_EXCEEDED_ERROR_CODE = "HEVY_DEADLINE_EXCEEDED";

export interface HevyHttpErrorOptions {
	status?: number;
	statusText?: string;
	data?: unknown;
	headers?: Headers;
	method: string;
	endpoint: string;
	code?: string;
	cause?: unknown;
	phase?: HevyRequestPhase;
	operationSafety?: HevyOperationSafety;
	commitState?: HevyCommitState;
	safeToRetry?: boolean;
	outcome?: HevyExecutionOutcome;
}

const MAX_RESPONSE_ERROR_MESSAGE_LENGTH = 2_048;

function normalizeResponseErrorMessage(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const message = value.trim();
	return message.length > 0
		? message.slice(0, MAX_RESPONSE_ERROR_MESSAGE_LENGTH)
		: undefined;
}

/** Extract only a bounded message field from an API error response. */
export function getHevyResponseErrorMessage(
	error: unknown,
): string | undefined {
	if (!error || typeof error !== "object") return undefined;
	const candidate = error as { data?: unknown; name?: unknown };
	if (candidate.name !== "HevyHttpError") return undefined;
	const data = candidate.data;
	const direct = normalizeResponseErrorMessage(data);
	if (direct) return direct;
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		return undefined;
	}

	for (const key of ["error", "message", "detail"] as const) {
		const message = normalizeResponseErrorMessage(
			(data as Record<string, unknown>)[key],
		);
		if (message) return message;
	}
	return undefined;
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
	readonly statusText?: string;
	readonly data?: unknown;
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
		super(message, { cause: options.cause });
		this.name = "HevyHttpError";
		this.status = options.status;
		this.statusText = options.statusText;
		this.data = options.data;
		this.headers = options.headers;
		this.method = options.method;
		this.endpoint = options.endpoint;
		this.code = options.code;
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

export function isHevyHttpError(error: unknown): error is HevyHttpError {
	return error instanceof HevyHttpError;
}
