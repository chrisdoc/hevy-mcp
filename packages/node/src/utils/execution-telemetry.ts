import type { StructuredExecutionProjection } from "@hevy-mcp/core";
import type { HevyRequestObservation } from "@hevy-mcp/hevy-client";

type ExecutionAttributeSource = {
	readonly outcome?: StructuredExecutionProjection["outcome"];
	readonly phase?: StructuredExecutionProjection["phase"];
	readonly operation_safety?: StructuredExecutionProjection["operation_safety"];
	readonly operationSafety?: HevyRequestObservation["operationSafety"];
	readonly commit_state?: StructuredExecutionProjection["commit_state"];
	readonly commitState?: HevyRequestObservation["commitState"];
	readonly safe_to_retry?: StructuredExecutionProjection["safe_to_retry"];
	readonly safeToRetry?: HevyRequestObservation["safeToRetry"];
};

export type ExecutionTelemetryNamespace = "span" | "metric";
type ExecutionAttributes = Record<string, string | boolean>;

/** Project either structured errors or client observations into stable OTel keys. */
export function projectExecutionAttributes(
	execution: ExecutionAttributeSource | undefined,
	namespace: ExecutionTelemetryNamespace = "span",
): ExecutionAttributes {
	if (!execution) return {};
	const prefix = namespace === "span" ? "hevy.api." : "";
	const operationSafety =
		execution.operation_safety ?? execution.operationSafety;
	const commitState = execution.commit_state ?? execution.commitState;
	const safeToRetry = execution.safe_to_retry ?? execution.safeToRetry;
	const attributes: Record<string, string | boolean> = {};
	if (execution.outcome) attributes[`${prefix}outcome`] = execution.outcome;
	if (execution.phase) attributes[`${prefix}phase`] = execution.phase;
	if (operationSafety)
		attributes[`${prefix}operation_safety`] = operationSafety;
	if (commitState) attributes[`${prefix}commit_state`] = commitState;
	if (safeToRetry !== undefined)
		attributes[`${prefix}safe_to_retry`] = safeToRetry;
	return attributes;
}
