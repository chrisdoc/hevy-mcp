export const RESULT_COUNT_BUCKETS = ["0", "1", "2-10", "11-50", "51+"] as const;

export type ResultCountBucket = (typeof RESULT_COUNT_BUCKETS)[number];

export interface WorkflowResultTelemetry {
	readonly name: "training-summary" | "routine-discovery";
	readonly pagination: Readonly<Record<string, number>>;
	readonly cacheStatus: "hit" | "miss" | "not-used";
	readonly itemsScanned: number;
}

export interface ToolResultTelemetry {
	readonly itemCountBucket?: ResultCountBucket;
	readonly exerciseCountBucket?: ResultCountBucket;
	readonly setCountBucket?: ResultCountBucket;
	readonly workflow?: WorkflowResultTelemetry;
	readonly expected404Outcome?: "not_found" | "end_of_list" | "mutation_error";
}

export function bucketCount(value: number): ResultCountBucket {
	if (!Number.isFinite(value) || value <= 0) return "0";
	if (value === 1) return "1";
	if (value <= 10) return "2-10";
	if (value <= 50) return "11-50";
	return "51+";
}

type ResultOwner = { readonly content: readonly unknown[] };
const resultTelemetry = new WeakMap<ResultOwner, ToolResultTelemetry>();

export function attachResultTelemetry(
	result: ResultOwner,
	telemetry: ToolResultTelemetry | undefined,
): void {
	if (telemetry) resultTelemetry.set(result, telemetry);
}

export function getResultTelemetry(
	result: ResultOwner,
): ToolResultTelemetry | undefined {
	return resultTelemetry.get(result);
}
