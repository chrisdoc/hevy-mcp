import { DEFAULT_API_TIMEOUT_MS } from "@hevy-mcp/hevy-client";
import { runCli } from "./main.js";

const lifecycleController = new AbortController();
const abortOnSignal = (signal: NodeJS.Signals) => {
	lifecycleController.abort(
		new DOMException(`CLI shutdown requested by ${signal}`, "AbortError"),
	);
};
process.once("SIGINT", abortOnSignal);
process.once("SIGTERM", abortOnSignal);

try {
	const exitCode = await runCli({
		argv: process.argv.slice(2),
		execution: {
			signal: lifecycleController.signal,
			deadline: Date.now() + DEFAULT_API_TIMEOUT_MS,
		},
	});
	if (exitCode !== 0) process.exitCode = exitCode;
} finally {
	process.removeListener("SIGINT", abortOnSignal);
	process.removeListener("SIGTERM", abortOnSignal);
}
