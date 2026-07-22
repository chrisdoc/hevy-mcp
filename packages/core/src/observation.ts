import type { SafeErrorDiagnostic } from "./utils/error-policy.js";
import type { ToolResultTelemetry } from "./utils/result-telemetry.js";

export interface ToolInvocationObservation {
	readonly name: string;
	readonly argumentKeys?: readonly string[];
	readonly taxonomy?: string;
	readonly argumentKeyCountBucket?: "0" | "1" | "2-5" | "6+";
}

export interface ToolResultObservation {
	readonly isError: boolean;
	readonly hasStructuredContent: boolean;
	readonly contentCount: number;
	readonly summary?: ToolResultTelemetry;
}

export interface ToolCompletionObservation {
	readonly outcome: "success" | "returned_error" | "thrown_error";
	readonly durationMs: number;
	readonly result?: ToolResultObservation;
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
					operationPromise = Promise.resolve().then(operation);
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
