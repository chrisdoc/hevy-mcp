/**
 * Metric instruments for Honeycomb.
 *
 * These are created once from the shared meter provider and exported
 * for use throughout the codebase. All instruments are sent to Honeycomb
 * via the OTLP metrics exporter configured in telemetry.ts.
 */

import { meter } from "./telemetry.js";

/** Total MCP tool invocations grouped by name and bounded taxonomy. */
export const toolInvocations = meter.createCounter("mcp.tool.invocations", {
	description: "Total MCP tool invocations",
});
/** Total MCP tool outcomes, grouped by bounded taxonomy and outcome. */
export const toolOutcomes = meter.createCounter("mcp.tool.outcomes", {
	description: "Total MCP tool outcomes",
});

/** Total MCP sessions started, grouped by sanitized client metadata. */
export const sessionStarted = meter.createCounter("mcp.session.started", {
	description: "Total MCP sessions started",
});

/** Total MCP sessions ended, grouped by bounded termination metadata. */
export const sessionEnded = meter.createCounter("mcp.session.ended", {
	description: "Total MCP sessions ended",
});

/** Total thrown MCP tool errors grouped by name, taxonomy, and error type. */
export const toolErrors = meter.createCounter("mcp.tool.errors", {
	description: "Total MCP tool errors",
});

/** Expected Hevy 404s handled as not-found, end-of-list, or caller errors. */
export const expectedHevy404s = meter.createCounter("hevy.expected_404s", {
	description: "Expected Hevy 404 outcomes",
});

/** MCP tool execution duration in milliseconds. */
export const toolDuration = meter.createHistogram("mcp.tool.duration_ms", {
	description: "MCP tool execution duration in milliseconds",
	unit: "ms",
});

/** Total Hevy API calls, grouped by method, endpoint, and status code. */
export const apiCalls = meter.createCounter("hevy.api.calls", {
	description: "Total Hevy API calls",
});

/** Hevy API response time in milliseconds. */
export const apiDuration = meter.createHistogram("hevy.api.duration_ms", {
	description: "Hevy API response time in milliseconds",
	unit: "ms",
});

/** Total stdio JSON parse errors, grouped by failure location. */
export const stdioParseErrors = meter.createCounter("mcp.stdio.parse_errors", {
	description: "Total stdio JSON parse errors",
});

/** Total server startup count, grouped by version. */
export const serverStartups = meter.createCounter("mcp.server.startups", {
	description: "Total server startup count",
});
