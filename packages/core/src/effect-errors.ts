import { Data } from "effect";

/** Typed error vocabulary reserved for the Effect-based migration path. */
export class RateLimitError extends Data.TaggedError("RateLimitError")<{
	readonly status: number;
	readonly endpoint: string;
	readonly method: string;
	readonly retryAfterSeconds?: number;
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
	readonly status: number;
	readonly endpoint: string;
	readonly method: string;
}> {}

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
	readonly status: number;
	readonly endpoint: string;
	readonly method: string;
	readonly expected: boolean;
}> {}

export class NetworkError extends Data.TaggedError("NetworkError")<{
	readonly code: string;
	readonly retryCount?: number;
	readonly retryExhausted: boolean;
}> {}

export class ApiError extends Data.TaggedError("ApiError")<{
	readonly status: number;
	readonly endpoint: string;
	readonly method: string;
}> {}
