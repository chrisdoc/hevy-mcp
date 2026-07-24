import type { ErrorType, SafeErrorDiagnostic } from "./utils/error-policy.js";
import type {
	ResultCountBucket,
	ToolResultTelemetry,
} from "./utils/result-telemetry.js";
import type { ToolTelemetryMetadata } from "./utils/tool-taxonomy.js";

export type SafeToolArgumentKey =
	| "date"
	| "endDate"
	| "exerciseTemplateId"
	| "folderId"
	| "includeCustom"
	| "limit"
	| "offset"
	| "page"
	| "pageSize"
	| "primaryMuscleGroup"
	| "query"
	| "refresh"
	| "routineId"
	| "since"
	| "startDate"
	| "updatedSince"
	| "workoutId";

export type SafeToolPresenceArgumentKey = Extract<
	SafeToolArgumentKey,
	| "date"
	| "endDate"
	| "exerciseTemplateId"
	| "folderId"
	| "primaryMuscleGroup"
	| "query"
	| "routineId"
	| "since"
	| "startDate"
	| "updatedSince"
	| "workoutId"
>;

export type SafeToolNumericArgumentKey = Extract<
	SafeToolArgumentKey,
	"limit" | "offset" | "page" | "pageSize"
>;

export type SafeToolBooleanArgumentKey = Extract<
	SafeToolArgumentKey,
	"includeCustom" | "refresh"
>;

export interface ToolInvocationObservation {
	readonly name: string;
	/** The MCP primitive being observed; omitted values remain tool-compatible. */
	readonly kind?: "tool" | "prompt";
	readonly taxonomy?: ToolTelemetryMetadata;
	readonly argumentKeys?: readonly SafeToolArgumentKey[];
	readonly argumentPresence?: Partial<
		Readonly<Record<SafeToolPresenceArgumentKey, true>>
	>;
	readonly numericArgumentBuckets?: Partial<
		Readonly<Record<SafeToolNumericArgumentKey, ResultCountBucket>>
	>;
	readonly booleanArguments?: Partial<
		Readonly<Record<SafeToolBooleanArgumentKey, boolean>>
	>;
	readonly argumentKeyCountBucket?: ResultCountBucket;
}

export interface ToolResultObservation {
	readonly isError: boolean;
	readonly hasStructuredContent: boolean;
	readonly contentCountBucket: ResultCountBucket;
	readonly summary?: ToolResultTelemetry;
}

export interface ToolCompletionObservation {
	readonly outcome: "success" | "returned_error" | "thrown_error";
	readonly durationMs: number;
	readonly result?: ToolResultObservation;
	readonly errorType?: ErrorType;
	readonly error?: SafeErrorDiagnostic;
}

export interface ToolObservationScope {
	run<T>(operation: () => Promise<T>): Promise<T>;
	finish(completion: ToolCompletionObservation): void | Promise<void>;
}

export interface ToolObserver {
	start(invocation: ToolInvocationObservation): ToolObservationScope | void;
}

export type SafeToolInvocation = ToolInvocationObservation;
export type SafeToolCompletion = ToolCompletionObservation;

export function memoizeObservationScope(
	scope: ToolObservationScope | void,
): ToolObservationScope | undefined {
	if (!scope) return undefined;
	let finished = false;
	let operationPromise: Promise<unknown> | undefined;
	return {
		run<T>(operation: () => Promise<T>): Promise<T> {
			if (!operationPromise) {
				try {
					operationPromise = Promise.resolve(scope.run(operation));
				} catch (error) {
					operationPromise = Promise.reject(error);
				}
			}
			return operationPromise as Promise<T>;
		},
		finish(completion) {
			if (finished) return;
			finished = true;
			try {
				const pending = scope.finish(completion);
				if (pending) void pending.catch(() => undefined);
			} catch {
				// Observation must never alter MCP behavior.
			}
		},
	};
}
