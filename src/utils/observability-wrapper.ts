import { withErrorHandling } from "./error-handler.js";
import type { McpToolResponse } from "./response-formatter.js";
import { createSafeErrorDiagnostic } from "./safe-error-diagnostic.js";
import { Sentry } from "./telemetry.js";
import { withTelemetry } from "./telemetry-wrapper.js";

/**
 * Wrap an MCP tool handler with telemetry inside error response handling.
 */
export function withObservability<
	TParams extends Record<string, unknown>,
	TResponse extends McpToolResponse,
>(
	fn: (args: TParams) => Promise<TResponse>,
	context: string,
): (args: TParams) => Promise<McpToolResponse> {
	return withErrorHandling(
		withTelemetry(fn, context),
		context,
		(error, _toolContext, argumentKeyCount) => {
			const diagnostic = createSafeErrorDiagnostic(error);
			Sentry.withScope((scope) => {
				scope.setTag("error.category", diagnostic.category);
				if (diagnostic.code) scope.setTag("error.code", diagnostic.code);
				if (diagnostic.status !== undefined) {
					scope.setTag("http.status_code", String(diagnostic.status));
				}
				scope.setContext("mcpTool", { argumentKeyCount });
				scope.setContext("safeError", { ...diagnostic });
				Sentry.captureMessage("MCP tool failure", "error");
			});
		},
	);
}
