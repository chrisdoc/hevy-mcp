import { Effect } from "effect";

type EffectOperation<TArgs extends readonly unknown[], TResult> = {
	readonly effect: (...args: TArgs) => Effect.Effect<TResult, unknown, never>;
};

export function requireOperation<T>(operation: T | undefined, id: string): T {
	if (operation === undefined) {
		throw new Error(`Operation ${id} is unavailable.`);
	}
	return operation;
}

export function operationEffect<TArgs extends readonly unknown[], TResult>(
	operation: EffectOperation<TArgs, TResult>,
	...args: TArgs
): Effect.Effect<TResult, unknown, never> {
	return Effect.suspend(() => operation.effect(...args));
}
