import type {
	HevyClient,
	HevyCommitState,
	HevyExecutionOutcome,
	HevyOperationSafety,
	HevyRequestOptions,
	HevyRequestPhase,
} from "@hevy-mcp/hevy-client";
import { Cause, Clock, Effect, Exit } from "effect";
import { isFunction } from "./utils/type-predicates.js";

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
type MutableExecutionProjection = {
	-readonly [
		K in keyof StructuredExecutionProjection
	]?: StructuredExecutionProjection[K];
} & Pick<
	StructuredExecutionProjection,
	"outcome" | "phase" | "operation_safety" | "commit_state" | "safe_to_retry"
>;

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
	const projection: MutableExecutionProjection = {
		outcome: source?.outcome ?? "terminal_failure",
		phase: source?.phase ?? "before-dispatch",
		operation_safety: source?.operation_safety ?? "read",
		commit_state: source?.commit_state ?? "not_sent",
		safe_to_retry: source?.safe_to_retry ?? false,
	};
	if (source?.code) projection.code = source.code;
	if (source?.status !== undefined) projection.status = source.status;
	return projection;
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
	// avoiding one retained lifecycle/request listener per invocation. Older
	// self-hosted Node runtimes (< 20.3) lack it; the TypeError from the missing
	// static falls through to manual composition instead of failing dispatch.
	try {
		return AbortSignal.any(active);
	} catch (error) {
		if (!(error instanceof TypeError)) throw error;
	}
	const composed = new AbortController();
	const listeners: Array<{
		signal: AbortSignal;
		onAbort: () => void;
	}> = [];
	const abort = (signal: AbortSignal) => {
		for (const listener of listeners) {
			listener.signal.removeEventListener("abort", listener.onAbort);
		}
		listeners.length = 0;
		composed.abort(signal.reason);
	};
	for (const signal of active) {
		if (signal.aborted) {
			abort(signal);
			break;
		}
		const onAbort = () => abort(signal);
		listeners.push({ signal, onAbort });
		signal.addEventListener("abort", onAbort, { once: true });
	}
	return composed.signal;
}

/**
 * Run one MCP operation with the request's remaining budget.
 *
 * The timeout is deliberately calculated inside the Effect runtime so tests
 * can provide TestClock and callers cannot bypass an absolute deadline by
 * omitting `forExecution` from a handler.
 */
export async function runBoundedExecution<A, E>(
	effect: Effect.Effect<A, E>,
	options: {
		readonly signal?: AbortSignal;
		readonly timeoutMs: number;
		readonly deadline?: number;
	},
): Promise<A> {
	const bounded = Effect.gen(function* () {
		const now = yield* Clock.currentTimeMillis;
		const deadline = options.deadline ?? now + options.timeoutMs;
		const remaining = Math.max(0, deadline - now);
		return yield* Effect.timeout(effect, remaining);
	});
	const exit = await Effect.runPromiseExit(bounded, {
		signal: options.signal,
	});
	if (Exit.isSuccess(exit)) return exit.value;
	const failure = exit.cause.reasons.find(Cause.isFailReason)?.error;
	if (failure !== undefined) throw failure;
	if (Cause.hasInterruptsOnly(exit.cause)) {
		throw new DOMException(
			"The request was canceled by the client.",
			"AbortError",
		);
	}
	throw new Error("The request failed unexpectedly.");
}

type ClientMethod = keyof HevyClient;

/**
 * The curated client's options slot is deliberately explicit. Inferring it
 * from the final argument is unsafe because IDs and request payloads are also
 * objects/strings and most generated wrappers silently ignore extra args.
 */
/** Canonical options-slot metadata shared by binding and table-driven tests. */
export const HEVY_CLIENT_OPTION_INDEXES = {
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
} satisfies Record<ClientMethod, number>;

/**
 * Bind one immutable control object to every curated client operation. A
 * proxy keeps existing tool code source-compatible while making it impossible
 * for one page of a workflow to silently lose cancellation/deadline state.
 */
export function bindClientExecution<TClient extends HevyClient>(
	client: TClient,
	control: ToolExecutionContext,
): TClient {
	return new Proxy(client, {
		get(target, property, receiver) {
			const value = Reflect.get(target, property, receiver);
			if (!isFunction(value)) return value;
			// Proxy invariant: a non-configurable, non-writable own data
			// property must be reported verbatim. The hidden native request
			// Effect seam is defined exactly that way; returning a bound or
			// options-binding copy would fabricate a new function value and
			// throw a TypeError when operations recover the seam through
			// this proxy.
			const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
			if (
				descriptor !== undefined &&
				descriptor.configurable === false &&
				descriptor.writable === false
			) {
				return value;
			}
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
	}) as TClient;
}
