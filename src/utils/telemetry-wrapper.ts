import { SpanStatusCode } from "@opentelemetry/api";
import { debugLog, isDebugEnabled, redactToolArgs } from "./debug.js";
import { resolveErrorPolicy } from "./error-policy.js";
import { toolDuration, toolErrors, toolInvocations } from "./metrics.js";
import type { McpToolResponse } from "./response-formatter.js";
import { tracer } from "./telemetry.js";

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getWorkflowTelemetry(result: McpToolResponse): {
	name: string;
	pagination: Record<string, number>;
	cacheStatus: string;
	itemsScanned: number;
} | null {
	const structuredContent = result.structuredContent;
	if (!isRecord(structuredContent)) return null;
	const workflow = structuredContent.workflow;
	if (!isRecord(workflow)) return null;
	const name = workflow.name;
	const paginationValue = workflow.pagination;
	const cacheStatus = workflow.cacheStatus;
	const itemsScanned = workflow.itemsScanned;
	if (
		typeof name !== "string" ||
		!isRecord(paginationValue) ||
		typeof cacheStatus !== "string" ||
		typeof itemsScanned !== "number" ||
		!Number.isSafeInteger(itemsScanned) ||
		itemsScanned < 0
	) {
		return null;
	}
	const pagination: Record<string, number> = {};
	for (const [key, value] of Object.entries(paginationValue)) {
		if (
			typeof value === "number" &&
			Number.isSafeInteger(value) &&
			value >= 0
		) {
			pagination[key] = value;
		}
	}
	return { name, pagination, cacheStatus, itemsScanned };
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

		const safeArgs = extractSafeArgs(args);
		const whitelistedKeys = Object.keys(safeArgs).map((key) =>
			key.replace("mcp.tool.args.", ""),
		);

		return tracer.startActiveSpan(
			`mcp.tool.${context}`,
			{
				attributes: {
					"mcp.tool.name": context,
					"workflow.name": context,
					"mcp.tool.args.key_count": argumentKeyCount,
					"mcp.tool.args.keys": whitelistedKeys.join(","),
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
					const workflow = getWorkflowTelemetry(result);
					if (workflow) {
						span.setAttribute("workflow.name", workflow.name);
						span.setAttribute("workflow.cache_status", workflow.cacheStatus);
						span.setAttribute("workflow.items_scanned", workflow.itemsScanned);
						for (const [resource, pageCount] of Object.entries(
							workflow.pagination,
						)) {
							span.setAttribute(
								`workflow.pagination.${resource}.pages`,
								pageCount,
							);
						}
					}
					return result;
				} catch (error) {
					isError = true;
					span.setStatus({ code: SpanStatusCode.ERROR });
					const policy = resolveErrorPolicy(error, "");
					const { diagnostic } = policy;
					span.addEvent("mcp.tool.failure", {
						"error.category": diagnostic.category,
						...(diagnostic.code ? { "error.code": diagnostic.code } : {}),
						...(diagnostic.status !== undefined
							? { "http.status_code": diagnostic.status }
							: {}),
						...(diagnostic.method ? { "http.method": diagnostic.method } : {}),
						...(diagnostic.endpoint
							? { "hevy.api.endpoint": diagnostic.endpoint }
							: {}),
					});

					const errorType = policy.type;
					span.setAttribute("error.type", errorType);

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
