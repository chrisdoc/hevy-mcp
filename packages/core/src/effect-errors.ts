import { Schema } from "effect";

/** Typed error vocabulary reserved for the Effect-based migration path. */
export class RateLimitError extends Schema.TaggedError<RateLimitError>()(
	"RateLimitError",
	{
		status: Schema.Number,
		endpoint: Schema.String,
		method: Schema.String,
		retryAfterSeconds: Schema.optional(Schema.Number),
	},
) {}

export class ValidationError extends Schema.TaggedError<ValidationError>()(
	"ValidationError",
	{
		status: Schema.Number,
		endpoint: Schema.String,
		method: Schema.String,
	},
) {}

export class NotFoundError extends Schema.TaggedError<NotFoundError>()(
	"NotFoundError",
	{
		status: Schema.Number,
		endpoint: Schema.String,
		method: Schema.String,
		expected: Schema.Boolean,
	},
) {}

export class NetworkError extends Schema.TaggedError<NetworkError>()(
	"NetworkError",
	{
		code: Schema.String,
		retryCount: Schema.optional(Schema.Number),
		retryExhausted: Schema.Boolean,
	},
) {}

export class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
	status: Schema.Number,
	endpoint: Schema.String,
	method: Schema.String,
}) {}
