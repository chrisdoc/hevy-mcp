import { withErrorHandling } from "./error-handler.js";
import type { McpToolResponse } from "./response-formatter.js";
import { resolveErrorPolicy } from "./error-policy.js";
import { Sentry } from "./telemetry.js";
import { withTelemetry } from "./telemetry-wrapper.js";
import type { ToolTelemetryMetadata } from "./tool-taxonomy.js";
import { bucketCount } from "./result-telemetry.js";

/** Wrap an MCP tool handler with telemetry inside error response handling. */
export function withObservability<TParams extends Record<string, unknown>>(
	fn: (args: TParams) => Promise<McpToolResponse>,
	context: string,
	metadata?: ToolTelemetryMetadata,
): (args: TParams) => Promise<McpToolResponse> {
	return withErrorHandling(
		withTelemetry(fn, context, metadata),
		context,
		(error, toolContext, argumentKeyCount) => {
			const { diagnostic } = resolveErrorPolicy(error, "");
			Sentry.withScope((scope) => {
				scope.setTag("mcp.tool.context", toolContext);
				scope.setTag("error.category", diagnostic.category);
				if (diagnostic.code) scope.setTag("error.code", diagnostic.code);
				if (diagnostic.status !== undefined) {
					scope.setTag("http.status_code", String(diagnostic.status));
				}
				if (diagnostic.endpoint) {
					scope.setTag("hevy.api.endpoint", diagnostic.endpoint);
				}
				scope.setContext("mcpTool", {
					context: toolContext,
					argumentKeyCountBucket: bucketCount(argumentKeyCount),
				});
				scope.setContext("safeError", { ...diagnostic });
				scope.setFingerprint([
					"mcp-tool-failure",
					toolContext,
					diagnostic.category,
					diagnostic.code ?? "none",
					String(diagnostic.status ?? "none"),
					diagnostic.endpoint ?? "none",
				]);
				Sentry.captureMessage("MCP tool failure", "error");
			});
		},
	);
}
