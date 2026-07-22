import { runStdioServer } from "./index.js";
import { MissingHevyApiKeyError } from "./utils/config.js";
import { createSafeErrorDiagnostic } from "@hevy-mcp/core";
import { flushTelemetry } from "./utils/telemetry.js";

void runStdioServer().catch(async (error) => {
	if (error instanceof MissingHevyApiKeyError) {
		console.error(error.message);
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
