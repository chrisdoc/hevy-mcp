import { runServer } from "./index.js";
import { createSafeErrorDiagnostic } from "./utils/safe-error-diagnostic.js";

void runServer().catch((error) => {
	console.error("Fatal error in main()", createSafeErrorDiagnostic(error));
	process.exit(1);
});
