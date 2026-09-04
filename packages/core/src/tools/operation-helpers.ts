import { Effect } from "effect";
import { OperationUnavailableError } from "../effect-errors.js";

type EffectOperation<TArgs extends readonly unknown[], TResult> = {
	readonly effect: (...args: TArgs) => Effect.Effect<TResult, unknown, never>;
};

export function requireOperation<T>(operation: T | undefined, id: string): T {
	if (operation === undefined) {
		throw new OperationUnavailableError({ operation: id });
	}
	return operation;
}

export function operationEffect<TArgs extends readonly unknown[], TResult>(
	operation: EffectOperation<TArgs, TResult>,
	...args: TArgs
): Effect.Effect<TResult, Error, never> {
	return Effect.suspend(() => operation.effect(...args)).pipe(
		Effect.mapError((error) =>
			error instanceof Error ? error : new Error("Operation failed."),
		),
	);
}
