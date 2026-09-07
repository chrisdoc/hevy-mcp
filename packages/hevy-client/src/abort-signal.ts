import { Effect } from "effect";

/**
 * Bridge an external AbortSignal into fiber interruption.
 *
 * The signal's reason is preserved by the caller that collapses the
 * interruption. This helper owns only the interruption and listener lifecycle
 * so adapters can share the same race and cleanup semantics.
 */
export function interruptOnAbortSignal(
	signal: AbortSignal,
): Effect.Effect<never> {
	return Effect.callback<never, never>((resume, interruptionSignal) => {
		const cleanup = () => {
			signal.removeEventListener("abort", onAbort);
			interruptionSignal.removeEventListener("abort", cleanup);
		};
		const onAbort = () => resume(Effect.interrupt);
		if (signal.aborted) onAbort();
		else signal.addEventListener("abort", onAbort, { once: true });
		interruptionSignal.addEventListener("abort", cleanup, { once: true });
		return Effect.sync(cleanup);
	}).pipe(Effect.interruptible);
}

/**
 * Bridge an external AbortSignal into a typed failure carrying the abort
 * reason (falling back to an AbortError DOMException).
 *
 * This is the shared implementation behind retry-backoff waits and catalog
 * loads: both race their work against abortion and must surface the reason
 * in the failure channel rather than interrupting the fiber. Callers that
 * need interruption instead use `interruptOnAbortSignal`.
 *
 * The error type defaults to `unknown` because abort reasons are untrusted
 * caller input. Adapters that promise a narrower channel instantiate `E`
 * explicitly; the cast is sound because the failure always escapes through
 * the adapter's own Promise edge, never through the typed Effect channel.
 */
export function failOnAbortSignal<E = unknown>(
	signal: AbortSignal,
): Effect.Effect<never, E> {
	const bridge = Effect.callback<never, unknown>(
		(resume, interruptionSignal) => {
			const cleanup = () => {
				signal.removeEventListener("abort", fail);
				interruptionSignal.removeEventListener("abort", cleanup);
			};
			const fail = () =>
				resume(
					Effect.fail(
						signal.reason ??
							new DOMException("Operation canceled", "AbortError"),
					),
				);
			if (signal.aborted) {
				fail();
				return;
			}
			signal.addEventListener("abort", fail, { once: true });
			interruptionSignal.addEventListener("abort", cleanup, { once: true });
			return Effect.sync(cleanup);
		},
	).pipe(Effect.interruptible);
	return bridge as Effect.Effect<never, E>;
}
