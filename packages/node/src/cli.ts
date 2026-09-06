import { runServer } from "./runtime.js";
import {
	getSafeStartupMessage,
	handleFatalStartupError,
} from "./utils/startup-errors.js";

export { getSafeStartupMessage, handleFatalStartupError };

void runServer().catch(async (error: Error | string) => {
	await handleFatalStartupError(error);
});
