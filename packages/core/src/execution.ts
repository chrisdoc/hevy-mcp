import type {
	HevyClient,
	HevyCommitState,
	HevyExecutionOutcome,
	HevyOperationSafety,
	HevyRequestOptions,
	HevyRequestPhase,
} from "@hevy-mcp/hevy-client";

/** Per-request control supplied by MCP, HTTP, CLI, or a lifecycle owner. */
export interface ToolExecutionContext extends HevyRequestOptions {
	readonly requestId?: string;
}

/** Safe, adapter-neutral execution metadata used in every structured error. */
export interface StructuredExecutionProjection {
	readonly outcome: HevyExecutionOutcome;
	readonly phase: HevyRequestPhase;
	readonly operation_safety: HevyOperationSafety;
	readonly commit_state: HevyCommitState;
	readonly safe_to_retry: boolean;
	readonly code?: string;
	readonly status?: number;
}

/** Backward-compatible name for the structured error projection. */
export type StructuredExecutionError = StructuredExecutionProjection;

export type ExecutionProjectionSource = Partial<
	Pick<
		StructuredExecutionProjection,
		| "outcome"
		| "phase"
		| "operation_safety"
		| "commit_state"
		| "safe_to_retry"
		| "code"
		| "status"
	>
>;

export function createExecutionProjection(
	source?: ExecutionProjectionSource,
): StructuredExecutionProjection {
	return {
		outcome: source?.outcome ?? "terminal_failure",
		phase: source?.phase ?? "before-dispatch",
		operation_safety: source?.operation_safety ?? "read",
		commit_state: source?.commit_state ?? "not_sent",
		safe_to_retry: source?.safe_to_retry ?? false,
		...(source?.code ? { code: source.code } : {}),
		...(source?.status !== undefined ? { status: source.status } : {}),
	};
}

export function mergeAbortSignals(
	...signals: Array<AbortSignal | undefined>
): AbortSignal | undefined {
	const active = signals.filter(
		(signal): signal is AbortSignal => signal !== undefined,
	);
	if (active.length === 0) return undefined;
	if (active.length === 1) return active[0];
	// Node 24 and the supported Worker runtimes provide AbortSignal.any. The
	// native composition owns listener cleanup when the derived signal settles,
	// avoiding one retained lifecycle/request listener per invocation.
	return AbortSignal.any(active);
}

type ClientMethod = keyof HevyClient;

/**
 * The curated client's options slot is deliberately explicit. Inferring it
 * from the final argument is unsafe because IDs and request payloads are also
 * objects/strings and most generated wrappers silently ignore extra args.
 */
/** Canonical options-slot metadata shared by binding and table-driven tests. */
export const HEVY_CLIENT_OPTION_INDEXES: Record<ClientMethod, number> = {
	getWorkouts: 1,
	getWorkout: 1,
	createWorkout: 1,
	updateWorkout: 2,
	getWorkoutCount: 0,
	getWorkoutEvents: 1,
	getRoutines: 1,
	getRoutineById: 1,
	createRoutine: 1,
	updateRoutine: 2,
	getExerciseTemplates: 1,
	getExerciseTemplate: 1,
	getExerciseHistory: 2,
	createExerciseTemplate: 1,
	getRoutineFolders: 1,
	createRoutineFolder: 1,
	getRoutineFolder: 1,
	getBodyMeasurements: 1,
	getBodyMeasurement: 1,
	createBodyMeasurement: 1,
	updateBodyMeasurement: 2,
	getUserInfo: 0,
};

/**
 * Bind one immutable control object to every curated client operation. A
 * proxy keeps existing tool code source-compatible while making it impossible
 * for one page of a workflow to silently lose cancellation/deadline state.
 */
export function bindClientExecution(
	client: HevyClient,
	control: ToolExecutionContext,
): HevyClient {
	return new Proxy(client, {
		get(target, property, receiver) {
			const value = Reflect.get(target, property, receiver);
			if (typeof value !== "function") return value;
			const optionIndex =
				property in HEVY_CLIENT_OPTION_INDEXES
					? HEVY_CLIENT_OPTION_INDEXES[property as ClientMethod]
					: undefined;
			if (optionIndex === undefined) {
				return value.bind(target);
			}
			return (...args: unknown[]) => {
				const provided = args[optionIndex] as HevyRequestOptions | undefined;
				const merged: HevyRequestOptions = {
					...provided,
					...control,
				};
				args[optionIndex] = merged;
				return Reflect.apply(value, target, args);
			};
		},
	}) as HevyClient;
}
