import { Cause, Context, Effect } from "effect";
import {
	OperationUnavailableError,
	type CoreToolError,
} from "../effect-errors.js";
import {
	isObject,
	isString,
	type RuntimeValue,
} from "../utils/type-predicates.js";

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

type CoreToolTag = CoreToolError["_tag"];

/**
 * The failure tags that survive the core boundary. `satisfies` keeps the
 * table complete at compile time: adding a member to `CoreToolError` without
 * listing its tag here is a type error, so the guard cannot drift from the
 * vocabulary the way the previous `instanceof` chain could.
 */
const CORE_TOOL_ERROR_TAGS = {
	ToolInputValidationError: true,
	ClientNotInitializedError: true,
	OperationUnavailableError: true,
	ApiError: true,
	NetworkError: true,
	NotFoundError: true,
	RateLimitError: true,
	ValidationError: true,
	EmptyMeasurementUpdateError: true,
	PaginationMismatchError: true,
	TemplatesSearchValidationError: true,
	TrainingSummaryDataError: true,
	TrainingSummaryValidationError: true,
	WorkoutPayloadError: true,
	WorkoutPrivacyError: true,
} as const satisfies Record<CoreToolTag, true>;

function isCoreToolError(error: RuntimeValue): error is CoreToolError {
	return (
		isObject(error) &&
		"_tag" in error &&
		isString(error._tag) &&
		error._tag in CORE_TOOL_ERROR_TAGS
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
