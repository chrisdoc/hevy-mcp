export const INVALID_API_KEY_MESSAGE =
	"HEVY_API_KEY is invalid or expired. Please check your API key in the Hevy app under Settings > API Key.";

export class NodeCliArgumentError extends Error {
	readonly _tag = "NodeCliArgumentError";

	constructor(message: string) {
		super(message);
		this.name = "NodeCliArgumentError";
	}
}

export class InvalidHevyApiKeyError extends Error {
	readonly _tag = "InvalidHevyApiKeyError";

	constructor() {
		super(INVALID_API_KEY_MESSAGE);
		this.name = "InvalidHevyApiKeyError";
	}
}

export type SafeStartupError = NodeCliArgumentError | InvalidHevyApiKeyError;

export function isSafeStartupError(
	error: Error | string,
): error is SafeStartupError {
	return (
		error instanceof NodeCliArgumentError ||
		error instanceof InvalidHevyApiKeyError
	);
}
