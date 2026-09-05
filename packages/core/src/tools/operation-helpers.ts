import { Cause, Effect } from "effect";
import {
	ApiError,
	ClientNotInitializedError,
	NetworkError,
	NotFoundError,
	OperationUnavailableError,
	RateLimitError,
	ToolInputValidationError,
	ValidationError,
	type CoreToolError,
} from "../effect-errors.js";
import type { RuntimeValue } from "../utils/type-predicates.js";

type EffectOperation<TArgs extends readonly unknown[], TResult> = {
	readonly effect: (...args: TArgs) => Effect.Effect<TResult, unknown, never>;
};

export function normalizeCoreEffect<A, E>(
	effect: Effect.Effect<A, E, never>,
): Effect.Effect<A, CoreToolError, never> {
	return Effect.catchCause(effect, (cause) =>
		Effect.failCause(normalizeCoreCause(cause)),
	);
}

export function requireOperation<T>(operation: T | undefined, id: string): T {
	if (operation === undefined) {
		throw new OperationUnavailableError({ operation: id });
	}
	return operation;
}

function isCoreToolError(error: RuntimeValue): error is CoreToolError {
	return (
		error instanceof ToolInputValidationError ||
		error instanceof ClientNotInitializedError ||
		error instanceof OperationUnavailableError ||
		error instanceof ApiError ||
		error instanceof NetworkError ||
		error instanceof NotFoundError ||
		error instanceof RateLimitError ||
		error instanceof ValidationError
	);
}

/**
 * Keep supported upstream tags typed at the core boundary. An operation is
 * external to core and its failure channel is intentionally unknown, so
 * hostile values become defects rather than widening every tool handler.
 */
export function normalizeCoreCause(
	cause: Cause.Cause<unknown>,
): Cause.Cause<CoreToolError> {
	return Cause.fromReasons(
		cause.reasons.map((reason) => {
			if (!Cause.isFailReason(reason)) return reason;
			return isCoreToolError(reason.error)
				? Cause.makeFailReason(reason.error)
				: Cause.makeDieReason(reason.error);
		}),
	);
}

export function operationEffect<TArgs extends readonly unknown[], TResult>(
	operation: EffectOperation<TArgs, TResult>,
	...args: TArgs
): Effect.Effect<TResult, CoreToolError, never> {
	// The operation package owns the external Effect seam. Normalize it once,
	// before the value reaches ToolEffectHandler or a tool definition.
	return normalizeCoreEffect(Effect.suspend(() => operation.effect(...args)));
}
