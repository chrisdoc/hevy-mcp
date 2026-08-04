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

/** Project either structured errors or client observations into stable OTel keys. */
export function projectExecutionAttributes(
	execution: ExecutionAttributeSource | undefined,
	namespace: ExecutionTelemetryNamespace = "span",
): Record<string, string | boolean> {
	if (!execution) return {};
	const prefix = namespace === "span" ? "hevy.api." : "";
	const operationSafety =
		execution.operation_safety ?? execution.operationSafety;
	const commitState = execution.commit_state ?? execution.commitState;
	const safeToRetry = execution.safe_to_retry ?? execution.safeToRetry;
	return {
		...(execution.outcome ? { [`${prefix}outcome`]: execution.outcome } : {}),
		...(execution.phase ? { [`${prefix}phase`]: execution.phase } : {}),
		...(operationSafety
			? { [`${prefix}operation_safety`]: operationSafety }
			: {}),
		...(commitState ? { [`${prefix}commit_state`]: commitState } : {}),
		...(safeToRetry !== undefined
			? { [`${prefix}safe_to_retry`]: safeToRetry }
			: {}),
	};
}
