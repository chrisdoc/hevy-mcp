import { SpanStatusCode } from "@opentelemetry/api";
import { debugLog, isDebugEnabled, redactToolArgs } from "./debug.js";
import { resolveErrorPolicy } from "./error-policy.js";
import {
	toolDuration,
	toolErrors,
	toolInvocations,
	toolOutcomes,
} from "./metrics.js";
import {
	getCurrentMcpClientMetadata,
	recordMcpToolFailure,
	recordMcpToolInvocation,
} from "./mcp-session-observability.js";
import type { McpClientMetricAttributes } from "./mcp-session-observability.js";
import type { ToolResultTelemetry } from "./result-telemetry.js";
import { bucketCount, getResultTelemetry } from "./result-telemetry.js";
import type { McpToolResponse } from "./response-formatter.js";
import { tracer } from "./telemetry.js";
import type { ToolTelemetryMetadata } from "./tool-taxonomy.js";

const STRUCTURAL_ARGUMENT_KEYS: Record<string, true> = {
	page: true,
	pageSize: true,
	since: true,
	workoutId: true,
	routineId: true,
	folderId: true,
	exerciseTemplateId: true,
	date: true,
	startDate: true,
	endDate: true,
	updatedSince: true,
	includeCustom: true,
	limit: true,
	offset: true,
	refresh: true,
	query: true,
	primaryMuscleGroup: true,
};

const BUCKETED_ARGUMENT_KEYS: Record<string, true> = {
	page: true,
	pageSize: true,
	limit: true,
	offset: true,
};

const PRESENCE_ONLY_ARGUMENT_KEYS: Record<string, true> = {
	since: true,
	workoutId: true,
	routineId: true,
	folderId: true,
	exerciseTemplateId: true,
	date: true,
	startDate: true,
	endDate: true,
	updatedSince: true,
	query: true,
	primaryMuscleGroup: true,
};

function extractSafeArgs(args: Record<string, unknown>): {
	attributes: Record<string, string | number | boolean>;
	keys: string[];
} {
	const attributes: Record<string, string | number | boolean> = {};
	const keys: string[] = [];
	for (const [key, value] of Object.entries(args)) {
		if (STRUCTURAL_ARGUMENT_KEYS[key] !== true) continue;
		keys.push(key);

		if (PRESENCE_ONLY_ARGUMENT_KEYS[key] === true) {
			if (value !== undefined && value !== null) {
				attributes[`mcp.tool.args.${key}.present`] = true;
			}
			continue;
		}

		if (BUCKETED_ARGUMENT_KEYS[key] === true && typeof value === "number") {
			attributes[`mcp.tool.args.${key}.bucket`] = bucketCount(value);
			continue;
		}

		if (typeof value === "boolean") {
			attributes[`mcp.tool.args.${key}`] = value;
		}
	}
	return { attributes, keys };
}

function setWorkflowAttributes(
	span: {
		setAttribute(key: string, value: string | number | boolean): void;
	},
	workflow: ToolResultTelemetry["workflow"],
): void {
	if (!workflow) return;
	span.setAttribute("workflow.name", workflow.name);
	span.setAttribute("workflow.cache_status", workflow.cacheStatus);
	span.setAttribute("workflow.items_scanned", workflow.itemsScanned);
	const allowedResources: Record<string, true> = {
		workouts: true,
		bodyMeasurements: true,
		routines: true,
	};
	for (const [resource, pageCount] of Object.entries(workflow.pagination)) {
		if (
			allowedResources[resource] === true &&
			Number.isSafeInteger(pageCount) &&
			pageCount >= 0
		) {
			span.setAttribute(`workflow.pagination.${resource}.pages`, pageCount);
		}
	}
}

function setResultAttributes(
	span: {
		setAttribute(key: string, value: string | number | boolean): void;
	},
	result: McpToolResponse,
): void {
	span.setAttribute("mcp.tool.result.is_error", Boolean(result.isError));
	span.setAttribute(
		"mcp.tool.result.has_structured_content",
		"structuredContent" in result && result.structuredContent !== undefined,
	);
	if (Array.isArray(result.content)) {
		span.setAttribute("mcp.tool.result.content_count", result.content.length);
	}

	const telemetry = getResultTelemetry(result);
	if (!telemetry) return;
	if (telemetry.itemCountBucket) {
		span.setAttribute(
			"mcp.tool.result.item_count_bucket",
			telemetry.itemCountBucket,
		);
	}
	if (telemetry.exerciseCountBucket) {
		span.setAttribute(
			"mcp.tool.result.exercise_count_bucket",
			telemetry.exerciseCountBucket,
		);
	}
	if (telemetry.setCountBucket) {
		span.setAttribute(
			"mcp.tool.result.set_count_bucket",
			telemetry.setCountBucket,
		);
	}
	if (telemetry.hasNotes !== undefined) {
		span.setAttribute("mcp.tool.result.has_notes", telemetry.hasNotes);
	}
	if (telemetry.folderSelected !== undefined) {
		span.setAttribute(
			"mcp.tool.result.folder_selected",
			telemetry.folderSelected,
		);
	}
	if (telemetry.usesRepRanges !== undefined) {
		span.setAttribute(
			"mcp.tool.result.uses_rep_ranges",
			telemetry.usesRepRanges,
		);
	}
	setWorkflowAttributes(span, telemetry.workflow);
}

function resultMetricAttributes(
	result: McpToolResponse,
): Record<string, string | boolean> {
	const attributes: Record<string, string | boolean> = {
		"mcp.tool.result.has_structured_content":
			"structuredContent" in result && result.structuredContent !== undefined,
	};
	const telemetry = getResultTelemetry(result);
	if (!telemetry) return attributes;
	if (telemetry.itemCountBucket) {
		attributes["mcp.tool.result.item_count_bucket"] = telemetry.itemCountBucket;
	}
	if (telemetry.exerciseCountBucket) {
		attributes["mcp.tool.result.exercise_count_bucket"] =
			telemetry.exerciseCountBucket;
	}
	if (telemetry.setCountBucket) {
		attributes["mcp.tool.result.set_count_bucket"] = telemetry.setCountBucket;
	}
	if (telemetry.hasNotes !== undefined) {
		attributes["mcp.tool.result.has_notes"] = telemetry.hasNotes;
	}
	if (telemetry.folderSelected !== undefined) {
		attributes["mcp.tool.result.folder_selected"] = telemetry.folderSelected;
	}
	if (telemetry.usesRepRanges !== undefined) {
		attributes["mcp.tool.result.uses_rep_ranges"] = telemetry.usesRepRanges;
	}
	return attributes;
}

function taxonomyAttributes(
	metadata: ToolTelemetryMetadata | undefined,
): Record<string, string> {
	return metadata
		? {
				"hevy.feature": metadata.feature,
				"mcp.tool.kind": metadata.kind,
				"mcp.tool.operation": metadata.operation,
			}
		: {};
}

function metricAttributes(
	context: string,
	metadata: ToolTelemetryMetadata | undefined,
	clientAttributes: McpClientMetricAttributes,
): Record<string, string> {
	return {
		tool_name: context,
		...taxonomyAttributes(metadata),
		...clientAttributes,
	};
}

/**
 * Privacy contract: this wrapper records only bounded tool taxonomy, structural
 * argument presence/buckets, safe result-shape metadata, and allowlisted error
 * diagnostics. It MUST NOT read or emit prompt text, tool arguments, result
 * bodies, identifiers, dates, titles, notes, descriptions, or measurements.
 */
export function withTelemetry<TParams extends Record<string, unknown>>(
	fn: (args: TParams) => Promise<McpToolResponse>,
	context: string,
	metadata?: ToolTelemetryMetadata,
): (args: TParams) => Promise<McpToolResponse> {
	return async (rawArgs: TParams) => {
		const args = rawArgs ?? {};
		if (isDebugEnabled()) {
			debugLog("tool_invocation", {
				tool: context,
				params: redactToolArgs(args),
			});
		}
		const { attributes: safeArgs, keys: safeArgumentKeys } =
			extractSafeArgs(args);
		const clientAttributes = recordMcpToolInvocation();
		let resultMetrics: Record<string, string | boolean> = {};
		const clientMetadata = getCurrentMcpClientMetadata();
		const metrics = metricAttributes(context, metadata, clientAttributes);
		const argumentKeyCount = Object.keys(args).length;
		const startTime = Date.now();
		let outcome: "success" | "returned_error" | "thrown_error" = "success";

		toolInvocations.add(1, metrics);

		return tracer.startActiveSpan(
			`mcp.tool.${context}`,
			{
				attributes: {
					"mcp.tool.name": context,
					...taxonomyAttributes(metadata),
					"mcp.client.name": clientMetadata.name,
					"mcp.client.version": clientMetadata.version,
					"mcp.protocol.version": clientMetadata.protocolVersion,
					"mcp.transport": "stdio",
					"mcp.tool.args.key_count_bucket": bucketCount(argumentKeyCount),
					"mcp.tool.args.keys": safeArgumentKeys.join(","),
					...safeArgs,
				},
			},
			async (span) => {
				try {
					const result = await fn(args);
					const isError = Boolean(result.isError);
					if (isError) recordMcpToolFailure();
					outcome = isError ? "returned_error" : "success";
					span.setStatus({
						code: isError ? SpanStatusCode.ERROR : SpanStatusCode.OK,
					});
					setResultAttributes(span, result);
					resultMetrics = resultMetricAttributes(result);
					span.setAttribute("mcp.tool.outcome", outcome);
					toolOutcomes.add(1, { ...metrics, outcome });
					return result;
				} catch (error) {
					outcome = "thrown_error";
					recordMcpToolFailure();
					span.setStatus({ code: SpanStatusCode.ERROR });
					span.setAttribute("mcp.tool.outcome", outcome);
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
						...metrics,
						error_type: errorType,
					});
					toolOutcomes.add(1, { ...metrics, outcome });
					throw error;
				} finally {
					toolDuration.record(Date.now() - startTime, {
						...metrics,
						...resultMetrics,
						is_error: String(outcome !== "success"),
						outcome,
					});
					span.end();
				}
			},
		);
	};
}
