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

/** Sanitized HTTP error that never contains credentials or full request URLs. */
export class HevyHttpError extends Error {
	readonly status?: number;
	readonly statusText?: string;
	readonly data?: unknown;
	readonly headers?: Headers;
	readonly method: string;
	readonly endpoint: string;
	readonly phase?: HevyRequestPhase;
	readonly operationSafety?: HevyOperationSafety;
	readonly commitState?: HevyCommitState;
	readonly safeToRetry?: boolean;
	readonly outcome?: HevyExecutionOutcome;
	/** Stable snake-case aliases for adapter/protocol projections. */
	readonly phase_name?: HevyRequestPhase;
	readonly operation_safety?: HevyOperationSafety;
	readonly commit_state?: HevyCommitState;
	readonly safe_to_retry?: boolean;
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
		this.phase = options.phase;
		this.operationSafety = options.operationSafety;
		this.commitState = options.commitState;
		this.safeToRetry = options.safeToRetry;
		this.outcome = options.outcome;
		this.phase_name = options.phase;
		this.operation_safety = options.operationSafety;
		this.commit_state = options.commitState;
		this.safe_to_retry = options.safeToRetry;
	}
}

export function isHevyHttpError(error: unknown): error is HevyHttpError {
	return error instanceof HevyHttpError;
}
