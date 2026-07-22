import type { LoggingMessageNotification } from "@modelcontextprotocol/sdk/types.js";
import { createSafeErrorDiagnostic } from "./safe-error-diagnostic.js";

export type McpClientLogMessage = LoggingMessageNotification["params"];
export type McpClientLogger = (message: McpClientLogMessage) => void;

interface LoggingServer {
	isConnected(): boolean;
	sendLoggingMessage(message: McpClientLogMessage): Promise<void>;
}

const SEND_FAILURE_MESSAGE =
	"Failed to send structured log message to MCP client";
const DISCONNECTED_MESSAGE =
	"Skipped structured MCP client log because the server is not connected";

/**
 * Create a best-effort, fire-and-forget logger for an MCP server connection.
 * Logging failures are reported to stderr and never escape into tool behavior.
 */
export function createMcpClientLogger(server: LoggingServer): McpClientLogger {
	return (message) => {
		try {
			if (!server.isConnected()) {
				console.error(DISCONNECTED_MESSAGE);
				return;
			}

			void server.sendLoggingMessage(message).catch((error: unknown) => {
				console.error(SEND_FAILURE_MESSAGE, createSafeErrorDiagnostic(error));
			});
		} catch (error) {
			console.error(SEND_FAILURE_MESSAGE, createSafeErrorDiagnostic(error));
		}
	};
}
