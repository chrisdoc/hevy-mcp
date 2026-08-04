/**
 * Runtime-neutral execution control shared by every Hevy adapter.
 *
 * The client owns this vocabulary so adapters can only present the same
 * outcome; they cannot accidentally grow incompatible retry/error taxonomies.
 */

export type HevyOperationSafety =
	| "read"
	| "idempotent-write"
	| "non-idempotent-write";

export type HevyRequestPhase =
	| "before-dispatch"
	| "dispatch"
	| "response-headers"
	| "response-content"
	| "backoff"
	| "completed";

export type HevyCommitState = "not_sent" | "confirmed" | "unknown";

export type HevyExecutionOutcome =
	| "success"
	| "expected"
	| "retryable_failure"
	| "terminal_failure"
	| "cancelled"
	| "deadline_exceeded";

export interface HevyExecutionOutcomeDetails {
	readonly outcome: HevyExecutionOutcome;
	readonly phase: HevyRequestPhase;
	readonly operation_safety: HevyOperationSafety;
	readonly commit_state: HevyCommitState;
	readonly safe_to_retry: boolean;
	readonly status?: number;
	readonly code?: string;
}

/** Caller-owned control for one logical operation (not one retry attempt). */
export interface HevyExecutionControl {
	readonly signal?: AbortSignal;
	/** Absolute epoch milliseconds. It is never reset for a retry or page. */
	readonly deadline?: number;
}

export interface HevyExecutionOptions extends HevyExecutionControl {}

/** Request options shared by the curated client and generated adapters. */
export interface HevyRequestOptions extends HevyExecutionOptions {}

export function isDeadlineExceeded(deadline: number | undefined): boolean {
	return deadline !== undefined && Date.now() >= deadline;
}

export function remainingDeadlineMs(deadline: number | undefined): number {
	return deadline === undefined
		? Number.POSITIVE_INFINITY
		: deadline - Date.now();
}

export function operationSafetyForMethod(method: string): HevyOperationSafety {
	const normalizedMethod = method.toUpperCase();
	if (["GET", "HEAD", "OPTIONS"].includes(normalizedMethod)) {
		return "read";
	}
	if (["PUT", "DELETE"].includes(normalizedMethod)) {
		return "idempotent-write";
	}
	return "non-idempotent-write";
}

export function canRetryOperation(
	safety: HevyOperationSafety,
	phase: HevyRequestPhase,
): boolean {
	if (safety === "non-idempotent-write") return false;
	return (
		phase === "before-dispatch" ||
		phase === "dispatch" ||
		phase === "response-headers" ||
		phase === "response-content" ||
		phase === "backoff"
	);
}

export function commitStateFor(
	safety: HevyOperationSafety,
	phase: HevyRequestPhase,
	confirmed: boolean,
): HevyCommitState {
	if (safety === "read") return confirmed ? "confirmed" : "not_sent";
	if (confirmed) return "confirmed";
	return phase === "before-dispatch" ? "not_sent" : "unknown";
}

/**
 * Build a signal that follows both caller cancellation and one absolute
 * deadline. The returned cleanup function must be called when the operation
 * completes so a long-lived server does not retain timers/listeners.
 */
export function createExecutionSignal(control: HevyExecutionControl): {
	signal: AbortSignal;
	abort: (reason?: unknown) => void;
	cleanup: () => void;
	deadlineTriggered: () => boolean;
} {
	const controller = new AbortController();
	let deadlineTriggered = false;
	const abortFromCaller = () => {
		if (!controller.signal.aborted) controller.abort(control.signal?.reason);
	};
	if (control.signal?.aborted) abortFromCaller();
	else
		control.signal?.addEventListener("abort", abortFromCaller, { once: true });
	let timer: ReturnType<typeof setTimeout> | undefined;
	if (control.deadline !== undefined) {
		const delay = Math.max(0, control.deadline - Date.now());
		timer = setTimeout(() => {
			deadlineTriggered = true;
			if (!controller.signal.aborted) {
				controller.abort(
					new DOMException("Operation deadline exceeded", "TimeoutError"),
				);
			}
		}, delay);
	}
	return {
		signal: controller.signal,
		abort: (reason?: unknown) => {
			if (!controller.signal.aborted) controller.abort(reason);
		},
		cleanup: () => {
			if (timer !== undefined) clearTimeout(timer);
			control.signal?.removeEventListener("abort", abortFromCaller);
		},
		deadlineTriggered: () => deadlineTriggered,
	};
}

export function isAbortLike(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return error.name === "AbortError" || error.name === "TimeoutError";
}
