import { runServer } from "./runtime.js";
import { MissingHevyApiKeyError } from "./utils/config.js";
import { createSafeErrorDiagnostic } from "@hevy-mcp/core";
import { flushTelemetry } from "./utils/telemetry.js";
import { isSafeStartupError } from "./utils/startup-errors.js";

export function getSafeStartupMessage(error: Error): string | undefined {
	if (error instanceof MissingHevyApiKeyError || isSafeStartupError(error)) {
		return error.message;
	}
	return undefined;
}

void runServer().catch(async (error) => {
	const safeMessage =
		error instanceof Error ? getSafeStartupMessage(error) : undefined;
	if (safeMessage !== undefined) {
		console.error(safeMessage);
	} else {
		console.error("Fatal error in main()", createSafeErrorDiagnostic(error));
	}
	try {
		await flushTelemetry();
	} catch {
		// Preserve the original fatal exit when telemetry flushing fails.
	}
	process.exit(1);
});
