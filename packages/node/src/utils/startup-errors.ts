import { createSafeErrorDiagnostic } from "@hevy-mcp/core";
import { MissingHevyApiKeyError } from "./config.js";
import { flushTelemetry } from "./telemetry.js";

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

export function getSafeStartupMessage(
	error: Error | string,
): string | undefined {
	if (
		error instanceof MissingHevyApiKeyError ||
		(error instanceof Error && isSafeStartupError(error))
	) {
		return error.message;
	}
	return undefined;
}

export type StartupErrorLogger = (
	message: string,
	...optionalParams: readonly unknown[]
) => void;

export interface FatalStartupErrorOptions {
	readonly log?: StartupErrorLogger;
	readonly exit?: (code: number) => void;
	readonly flush?: () => Promise<void>;
}

export async function handleFatalStartupError(
	error: Error | string,
	options: FatalStartupErrorOptions = {},
): Promise<void> {
	const log =
		options.log ??
		((message: string, ...optionalParams: readonly unknown[]) => {
			console.error(message, ...optionalParams);
		});
	const exit = options.exit ?? ((code: number) => process.exit(code));
	const flush = options.flush ?? flushTelemetry;

	const safeMessage = getSafeStartupMessage(error);
	if (safeMessage !== undefined) {
		log(safeMessage);
	} else {
		log("Fatal error in main()", createSafeErrorDiagnostic(error));
	}
	try {
		await flush();
	} catch {
		// Preserve the original fatal exit when telemetry flushing fails.
	}
	exit(1);
}
