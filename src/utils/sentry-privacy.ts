const SENTRY_PROHIBITED_MCP_ATTRIBUTES = new Set([
	"mcp.request.id",
	"mcp.session.id",
	"mcp.cancelled.request_id",
	"mcp.cancelled.reason",
	"mcp.progress.token",
	"mcp.progress.message",
	"mcp.resource.uri",
	"mcp.logging.message",
	"mcp.prompt.result.description",
	"mcp.request.argument",
	"mcp.client.name",
	"mcp.client.title",
	"mcp.client.version",
]);

type SentrySpanWithData = {
	data?: Record<string, unknown>;
};

/** Remove MCP correlation and unbounded client fields before Sentry export. */
export function sanitizeSentryMcpSpan<T extends SentrySpanWithData>(
	span: T,
): T {
	if (!span.data) return span;
	let sanitizedData: Record<string, unknown> | undefined;
	for (const key of SENTRY_PROHIBITED_MCP_ATTRIBUTES) {
		if (!(key in span.data)) continue;
		sanitizedData ??= { ...span.data };
		delete sanitizedData[key];
	}
	return sanitizedData ? { ...span, data: sanitizedData } : span;
}
