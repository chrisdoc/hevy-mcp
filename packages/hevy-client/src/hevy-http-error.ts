import type {
	HevyCommitState,
	HevyExecutionOutcome,
	HevyOperationSafety,
	HevyRequestPhase,
} from "./execution.js";
import { extractSafeResponseError } from "./response-error.js";

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
	readonly responseError?: string;
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
		this.responseError = extractSafeResponseError(options.data);
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

export function isHevyHttpError<T>(error: T): error is T & HevyHttpError {
	return error instanceof HevyHttpError;
}
