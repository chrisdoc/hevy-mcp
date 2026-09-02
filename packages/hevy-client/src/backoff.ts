import { Data, Duration, Effect } from "effect";

import type { HevyOperationSafety } from "./execution.js";

export interface BackoffFailureOptions {
	readonly cause: unknown;
	readonly method: string;
	readonly endpoint: string;
	readonly phase: "backoff";
	readonly operationSafety: HevyOperationSafety;
	readonly deadline?: number;
}

/** Internal typed failure used while adapting a retry wait. */
export class BackoffFailure extends Data.TaggedError("BackoffFailure")<{
	readonly cause: unknown;
	readonly method: string;
	readonly endpoint: string;
	readonly phase: "backoff";
	readonly operationSafety: HevyOperationSafety;
	readonly deadline?: number;
}> {}

function interruptionEffect(
	signal: AbortSignal,
): Effect.Effect<never, unknown> {
	return Effect.callback<never, unknown>((resume, interruptionSignal) => {
		const cleanup = () => {
			signal.removeEventListener("abort", fail);
			interruptionSignal.removeEventListener("abort", cleanup);
		};
		const fail = () =>
			resume(
				Effect.fail(
					signal.reason ?? new DOMException("Operation canceled", "AbortError"),
				),
			);
		if (signal.aborted) {
			fail();
			return;
		}
		signal.addEventListener("abort", fail, { once: true });
		interruptionSignal.addEventListener("abort", cleanup, { once: true });
		return Effect.sync(cleanup);
	}).pipe(Effect.interruptible);
}

/**
 * Wait using the Effect Clock while still observing the operation signal.
 * This is deliberately separate from the Promise adapter so TestClock can
 * control the actual production retry wait.
 */
export function effectClockSleep(
	delayMs: number,
	signal: AbortSignal,
): Effect.Effect<void, unknown> {
	if (signal.aborted) {
		return Effect.fail(
			signal.reason ?? new DOMException("Operation canceled", "AbortError"),
		);
	}
	const sleep = Effect.sleep(Duration.millis(Math.max(0, delayMs)));
	return Effect.raceFirst(sleep, interruptionEffect(signal)).pipe(
		Effect.asVoid,
	);
}

/**
 * Adapt the established Promise sleep hook to an interruptible Effect.
 * Synchronous throws are captured by tryPromise just like rejections.
 */
export function customPromiseSleep(
	delayMs: number,
	signal: AbortSignal,
	sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>,
): Effect.Effect<void, unknown> {
	return Effect.tryPromise({
		try: (interruptionSignal) => {
			if (signal.aborted) {
				return Promise.reject(
					signal.reason ?? new DOMException("Operation canceled", "AbortError"),
				);
			}
			return new Promise<void>((resolve, reject) => {
				let settled = false;
				const cleanup = () => {
					signal.removeEventListener("abort", onOperationAbort);
					interruptionSignal.removeEventListener("abort", onInterruptionAbort);
				};
				const settleReject = (cause: unknown) => {
					if (settled) return;
					settled = true;
					cleanup();
					reject(cause);
				};
				const onOperationAbort = () =>
					settleReject(
						signal.reason ??
							new DOMException("Operation canceled", "AbortError"),
					);
				const onInterruptionAbort = () =>
					settleReject(new DOMException("Effect interrupted", "AbortError"));
				signal.addEventListener("abort", onOperationAbort, { once: true });
				interruptionSignal.addEventListener("abort", onInterruptionAbort, {
					once: true,
				});
				if (signal.aborted) {
					onOperationAbort();
					return;
				}
				try {
					Promise.resolve(sleep(delayMs, signal)).then(() => {
						if (settled) return;
						settled = true;
						cleanup();
						resolve();
					}, settleReject);
				} catch (cause) {
					settleReject(cause);
				}
			});
		},
		catch: (cause) => cause,
	});
}

export function retryBackoff(
	options: BackoffFailureOptions & {
		readonly delayMs: number;
		readonly sleep?: (
			milliseconds: number,
			signal?: AbortSignal,
		) => Promise<void>;
		readonly signal: AbortSignal;
	},
): Effect.Effect<void, BackoffFailure> {
	const wait = options.sleep
		? customPromiseSleep(options.delayMs, options.signal, options.sleep)
		: effectClockSleep(options.delayMs, options.signal);
	return wait.pipe(
		Effect.mapError(
			(cause) =>
				new BackoffFailure({
					cause,
					method: options.method,
					endpoint: options.endpoint,
					phase: "backoff",
					operationSafety: options.operationSafety,
					deadline: options.deadline,
				}),
		),
	);
}
