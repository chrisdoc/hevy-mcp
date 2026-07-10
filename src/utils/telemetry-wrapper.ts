import { SpanStatusCode } from "@opentelemetry/api";
import { debugLog, isDebugEnabled, redactToolArgs } from "./debug.js";
import { determineErrorType } from "./error-classification.js";
import { toolDuration, toolErrors, toolInvocations } from "./metrics.js";
import type { McpToolResponse } from "./response-formatter.js";
import { getCurrentUserId, tracer } from "./telemetry.js";

/** Whitelist of safe argument keys that can be logged without exposing PII. */
const ARGUMENT_WHITELIST = new Set([
	"page",
	"pageSize",
	"since",
	"workoutId",
	"routineId",
	"folderId",
	"exerciseTemplateId",
	"date",
	"startDate",
	"endDate",
	"updatedSince",
	"includeCustom",
	"limit",
	"offset",
	"refresh",
	"query",
	"primaryMuscleGroup",
]);

function extractSafeArgs(
	args: Record<string, unknown>,
): Record<string, string | number | boolean> {
	const attributes: Record<string, string | number | boolean> = {};
	for (const [key, value] of Object.entries(args)) {
		if (!ARGUMENT_WHITELIST.has(key)) {
			continue;
		}

		if (
			typeof value !== "string" &&
			typeof value !== "number" &&
			typeof value !== "boolean"
		) {
			continue;
		}

		attributes[`mcp.tool.args.${key}`] =
			key === "query" && typeof value === "string" && value.length > 100
				? `${value.slice(0, 100)}...`
				: value;
	}
	return attributes;
}

/**
 * Wrap an MCP tool handler with its existing OpenTelemetry span and metrics.
 */
export function withTelemetry<TParams extends Record<string, unknown>>(
	fn: (args: TParams) => Promise<McpToolResponse>,
	context: string,
): (args: Record<string, unknown>) => Promise<McpToolResponse> {
	return async (rawArgs: Record<string, unknown>) => {
		const args = rawArgs ?? {};
		if (isDebugEnabled()) {
			debugLog("tool_invocation", {
				tool: context,
				params: redactToolArgs(args),
			});
		}
		const argumentKeyCount = Object.keys(args).length;
		const startTime = Date.now();
		let isError = false;

		toolInvocations.add(1, { tool_name: context });

		const userId = getCurrentUserId();
		const safeArgs = extractSafeArgs(args);
		const whitelistedKeys = Object.keys(safeArgs).map((key) =>
			key.replace("mcp.tool.args.", ""),
		);

		return tracer.startActiveSpan(
			`mcp.tool.${context}`,
			{
				attributes: {
					"mcp.tool.name": context,
					"mcp.tool.args.key_count": argumentKeyCount,
					"mcp.tool.args.keys": whitelistedKeys.join(","),
					...(userId ? { "user.id": userId } : {}),
					...safeArgs,
				},
			},
			async (span) => {
				try {
					const result = await fn(args as TParams);
					isError = Boolean(result.isError);
					span.setStatus({
						code: isError ? SpanStatusCode.ERROR : SpanStatusCode.OK,
					});
					span.setAttribute("mcp.tool.result.is_error", isError);
					if (result.content) {
						span.setAttribute(
							"mcp.tool.result.content_count",
							result.content.length,
						);
						const textLength = result.content.reduce(
							(sum, item) => sum + (item.text?.length ?? 0),
							0,
						);
						span.setAttribute("mcp.tool.result.text_length", textLength);
					}
					return result;
				} catch (error) {
					isError = true;
					span.setStatus({ code: SpanStatusCode.ERROR });
					span.recordException(error as Error);

					const errorType = determineErrorType(
						error,
						error instanceof Error ? error.message : String(error),
					);
					span.setAttribute("error.type", errorType);

					const rawCode =
						error instanceof Error && "code" in error
							? (error as { code?: unknown }).code
							: undefined;
					if (rawCode !== undefined && rawCode !== null) {
						span.setAttribute("error.code", String(rawCode as string | number));
					}

					toolErrors.add(1, {
						tool_name: context,
						error_type: errorType,
					});
					throw error;
				} finally {
					toolDuration.record(Date.now() - startTime, {
						tool_name: context,
						is_error: String(isError),
					});
					span.end();
				}
			},
		);
	};
}
