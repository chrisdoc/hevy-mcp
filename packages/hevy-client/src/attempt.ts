import { Data, Effect } from "effect";

import type {
	HevyCommitState,
	HevyOperationSafety,
	HevyRequestPhase,
} from "./execution.js";

export interface AttemptFailureOptions {
	readonly cause: unknown;
	readonly method: string;
	readonly endpoint: string;
	readonly phase: HevyRequestPhase;
	readonly operationSafety: HevyOperationSafety;
	readonly commitState: HevyCommitState;
	readonly responseConfirmed: boolean;
	readonly deadline?: number;
	readonly retryCount: number;
}

/** Typed internal channel for a dispatch or response-consumption failure. */
export class AttemptFailure extends Data.TaggedError("AttemptFailure")<{
	readonly cause: unknown;
	readonly method: string;
	readonly endpoint: string;
	readonly phase: HevyRequestPhase;
	readonly operationSafety: HevyOperationSafety;
	readonly commitState: HevyCommitState;
	readonly responseConfirmed: boolean;
	readonly deadline?: number;
	readonly retryCount: number;
}> {}

/**
 * Adapt one asynchronous attempt to Effect while retaining the metadata
 * needed by the transition policy if the adapter itself throws.
 */
export function attemptEffect<A>(
	options: AttemptFailureOptions & {
		readonly run: (signal: AbortSignal) => Promise<A>;
	},
): Effect.Effect<A, AttemptFailure> {
	return Effect.tryPromise({
		try: options.run,
		catch: (cause) =>
			new AttemptFailure({
				cause,
				method: options.method,
				endpoint: options.endpoint,
				phase: options.phase,
				operationSafety: options.operationSafety,
				commitState: options.commitState,
				responseConfirmed: options.responseConfirmed,
				deadline: options.deadline,
				retryCount: options.retryCount,
			}),
	});
}

/** Make observer and resource finalizers idempotent at their Effect seam. */
export function finalizeOnce(finalizer: () => void): () => void {
	let finalized = false;
	return () => {
		if (finalized) return;
		finalized = true;
		try {
			finalizer();
		} catch {
			// Resource finalization is best-effort and cannot replace settlement.
		}
	};
}
