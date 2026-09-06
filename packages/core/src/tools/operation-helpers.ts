import { Cause, Context, Effect } from "effect";
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

export function requireOperation<T>(
	operation: T | undefined,
	id: string,
): Effect.Effect<T, OperationUnavailableError, never> {
	return operation === undefined
		? Effect.fail(new OperationUnavailableError({ operation: id }))
		: Effect.succeed(operation);
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
			const normalized = isCoreToolError(reason.error)
				? Cause.makeFailReason(reason.error)
				: Cause.makeDieReason(reason.error);
			return normalized.annotate(Context.makeUnsafe(reason.annotations));
		}),
	);
}

export function operationEffect<TArgs extends readonly unknown[], TResult>(
	operation: Effect.Effect<
		EffectOperation<TArgs, TResult>,
		OperationUnavailableError,
		never
	>,
	...args: TArgs
): Effect.Effect<TResult, CoreToolError, never> {
	// The operation package owns the external Effect seam. Normalize it once,
	// before the value reaches ToolEffectHandler or a tool definition.
	return Effect.flatMap(operation, (resolved) =>
		normalizeCoreEffect(Effect.suspend(() => resolved.effect(...args))),
	);
}
