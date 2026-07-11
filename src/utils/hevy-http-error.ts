export const HEVY_RETRY_EXHAUSTED_ERROR_CODE = "HEVY_RETRY_EXHAUSTED";
export const HEVY_REQUEST_ABORTED_ERROR_CODE = "HEVY_REQUEST_ABORTED";

export interface HevyHttpErrorOptions {
	status?: number;
	statusText?: string;
	data?: unknown;
	headers?: Headers;
	method: string;
	endpoint: string;
	code?: string;
	cause?: unknown;
}

/** Sanitized HTTP error that never contains credentials or full request URLs. */
export class HevyHttpError extends Error {
	readonly status?: number;
	readonly statusText?: string;
	readonly data?: unknown;
	readonly headers?: Headers;
	readonly method: string;
	readonly endpoint: string;
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
	}
}

export function isHevyHttpError(error: unknown): error is HevyHttpError {
	return error instanceof HevyHttpError;
}
