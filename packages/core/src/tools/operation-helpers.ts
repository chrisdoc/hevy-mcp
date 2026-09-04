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
): Effect.Effect<TResult, unknown, never> {
	// Keep the operation's tagged failure intact until the MCP boundary. Mapping
	// every failure to Error here loses the _tag used by the core error policy.
	return Effect.suspend(() => operation.effect(...args));
}
