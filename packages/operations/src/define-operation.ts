import { Effect } from "effect";

export interface DefinedOperation<
	Descriptor,
	Args extends readonly unknown[],
	Result,
	Error,
> {
	readonly descriptor: Descriptor;
	readonly effect: (...args: Args) => Effect.Effect<Result, Error>;
	execute(...args: Args): Promise<Result>;
}

/**
 * Build one operation triple from a descriptor and a generator body.
 *
 * The tracing span derives from the descriptor (`operations.<id>`), so span
 * names cannot drift from operation identity. `execute` runs the same effect
 * value instead of closing over the partially built operation object. The
 * yielded-effect constraint rejects `R` at compile time: only `R = never`
 * bodies satisfy it, which is what keeps the `Effect.runPromise` edge total.
 * `E` resolves as the union of every yielded failure, so bodies that recover
 * typed errors keep their full channel.
 */
export function defineOperation<
	const Descriptor extends { readonly id: string },
	const Args extends readonly unknown[],
	Yielded extends Effect.Effect<unknown, unknown, never>,
	Result,
>(
	descriptor: Descriptor,
	body: (...args: Args) => Generator<Yielded, Result, never>,
): DefinedOperation<Descriptor, Args, Result, Effect.Error<Yielded>> {
	const traced = Effect.fn(`operations.${descriptor.id}`)(body);
	// Discharge Effect.fn's deferred conditional inference, which cannot
	// resolve inside a generic boundary. The Yielded constraint already proves
	// R = never, and Effect.Error<Yielded> is exactly the union Effect.fn
	// computes — identical at every call site once Yielded is concrete.
	const effect = traced as (
		...args: Args
	) => Effect.Effect<Result, Effect.Error<Yielded>>;
	return {
		descriptor,
		effect,
		execute(...args: Args) {
			return Effect.runPromise(effect(...args));
		},
	};
}
