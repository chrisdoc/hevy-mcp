import { Schema } from "effect";

/** Errors raised by core before an operation reaches the Hevy client. */
export class ToolInputValidationError extends Schema.TaggedError<ToolInputValidationError>()(
	"ToolInputValidationError",
	{
		path: Schema.String,
	},
) {
	readonly message = `Invalid input: ${this.path}.`;
}

export class ClientNotInitializedError extends Schema.TaggedError<ClientNotInitializedError>()(
	"ClientNotInitializedError",
	{},
) {
	readonly message = "API client not initialized. Please provide HEVY_API_KEY.";
}

export class OperationUnavailableError extends Schema.TaggedError<OperationUnavailableError>()(
	"OperationUnavailableError",
	{ operation: Schema.String },
) {
	readonly message = `Operation ${this.operation} is unavailable.`;
}

export {
	ApiError,
	NetworkError,
	NotFoundError,
	RateLimitError,
	ValidationError,
} from "@hevy-mcp/hevy-client";
