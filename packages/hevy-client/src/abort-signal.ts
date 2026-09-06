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
