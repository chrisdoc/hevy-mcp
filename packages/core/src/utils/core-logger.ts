import { Effect, Logger, LogLevel } from "effect";
import type {
	McpClientLogMessage,
	McpClientLogger,
} from "./mcp-client-logger.js";
import type { SafeErrorDiagnostic } from "./error-policy.js";

const levelForMcp = (
	level: LogLevel.LogLevel,
): McpClientLogMessage["level"] => {
	switch (level) {
		case "Debug":
			return "debug";
		case "Warn":
			return "warning";
		case "Error":
		case "Fatal":
			return "error";
		default:
			return "info";
	}
};

/**
 * Emit a bounded diagnostic through Effect's logger. The default Effect
 * logger writes to stderr; the optional MCP logger is an additional sink.
 * Logger failures are deliberately swallowed at this telemetry boundary.
 */
export function logCoreError(
	message: string,
	data?: SafeErrorDiagnostic,
	mcpLogger?: McpClientLogger,
): void {
	try {
		const sink = mcpLogger
			? Logger.make(({ message: loggedMessage, logLevel }) => {
					mcpLogger({
						level: levelForMcp(logLevel),
						logger: "hevy-core",
						data: {
							message: String(loggedMessage),
							...(data ?? {}),
						},
					});
				})
			: undefined;
		const stderr = Logger.make(({ message: loggedMessage }) => {
			if (data === undefined) {
				console.error(String(loggedMessage));
			} else {
				console.error(String(loggedMessage), data);
			}
		});
		const program = Effect.logError(message).pipe(
			Effect.provide(Logger.layer(sink ? [stderr, sink] : [stderr])),
		);
		Effect.runSync(program);
	} catch {
		// Observability is never allowed to change the business outcome.
	}
}
