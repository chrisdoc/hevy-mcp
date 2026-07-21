import { runServer } from "./index.js";
import { createSafeErrorDiagnostic } from "./utils/safe-error-diagnostic.js";
import { flushTelemetry } from "./utils/telemetry.js";

void runServer().catch(async (error) => {
	console.error("Fatal error in main()", createSafeErrorDiagnostic(error));
	try {
		await flushTelemetry();
	} catch {
		// Preserve the original fatal exit when telemetry flushing fails.
	}
	process.exit(1);
});
