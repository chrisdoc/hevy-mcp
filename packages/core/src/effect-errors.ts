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
		phase: Schema.optional(
			Schema.Union([
				Schema.Literal("before-dispatch"),
				Schema.Literal("dispatch"),
				Schema.Literal("response-headers"),
				Schema.Literal("response-content"),
				Schema.Literal("backoff"),
				Schema.Literal("completed"),
			]),
		),
		operationSafety: Schema.optional(
			Schema.Union([
				Schema.Literal("read"),
				Schema.Literal("idempotent-write"),
				Schema.Literal("non-idempotent-write"),
			]),
		),
		commitState: Schema.optional(
			Schema.Union([
				Schema.Literal("not_sent"),
				Schema.Literal("confirmed"),
				Schema.Literal("unknown"),
			]),
		),
		safeToRetry: Schema.optional(Schema.Boolean),
		outcome: Schema.optional(
			Schema.Union([
				Schema.Literal("success"),
				Schema.Literal("expected"),
				Schema.Literal("retryable_failure"),
				Schema.Literal("terminal_failure"),
				Schema.Literal("cancelled"),
				Schema.Literal("deadline_exceeded"),
			]),
		),
		retryCount: Schema.optional(Schema.Number),
		retryExhausted: Schema.Boolean,
	},
) {}

export class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
	status: Schema.Number,
	endpoint: Schema.String,
	method: Schema.String,
}) {}
