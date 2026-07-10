import { withErrorHandling } from "./error-handler.js";
import type { McpToolResponse } from "./response-formatter.js";
import { withTelemetry } from "./telemetry-wrapper.js";

/**
 * Wrap an MCP tool handler with telemetry inside error response handling.
 */
export function withObservability<TParams extends Record<string, unknown>>(
	fn: (args: TParams) => Promise<McpToolResponse>,
	context: string,
): (args: Record<string, unknown>) => Promise<McpToolResponse> {
	return withErrorHandling(withTelemetry(fn, context), context);
}
