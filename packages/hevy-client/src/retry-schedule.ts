import { Duration, Effect, Schedule } from "effect";

import type { HevyHttpError } from "./hevy-http-error.js";
import {
	DEFAULT_RETRY_POLICY,
	getRetryDelayMs,
	type RetryPolicy,
} from "./retry-policy.js";

export type RetryScheduleInput = Pick<HevyHttpError, "status" | "headers">;

export interface RetryScheduleOptions<ScheduleError = never> {
	/**
	 * Decides whether the schedule may continue for the current failure.
	 * Effect 4 exposes this as `Schedule.while` over schedule metadata,
	 * including the input failure.
	 */
	readonly whileInput?: (
		input: RetryScheduleInput,
		attempt: number,
	) => boolean | Effect.Effect<boolean, never>;
	/**
	 * Optional adapter for callers that need to observe or bound a calculated
	 * delay. The returned duration is the wait that Schedule will own.
	 */
	readonly delay?: (
		input: RetryScheduleInput,
		attempt: number,
		delayMs: number,
	) => Effect.Effect<Duration.Input, ScheduleError>;
}

/**
 * Builds the Effect schedule used by retrying client programs.
 *
 * The schedule owns retry timing, recurrence, and the input predicate. The
 * client supplies the safety predicate and optional delay adapter for
 * observation or deadline bounding. Jitter stays behind the injectable
 * `randomInt` seam (tests pass `() => 0`); it is deliberately sync so the
 * pure `getRetryDelayMs` policy needs no Effect context.
 */
export function createRetrySchedule<ScheduleError = never>(
	maxRetries: number,
	policy: RetryPolicy = DEFAULT_RETRY_POLICY,
	randomInt = (maxExclusive: number) =>
		Math.floor(Math.random() * maxExclusive),
	options: RetryScheduleOptions<ScheduleError> = {},
): Schedule.Schedule<number, RetryScheduleInput, ScheduleError> {
	return Schedule.recurs(Math.max(0, maxRetries)).pipe(
		Schedule.while(
			({ input, attempt }: Schedule.Metadata<number, RetryScheduleInput>) =>
				options.whileInput?.(input, attempt) ?? true,
		),
		Schedule.addDelay(
			({ input, attempt }: Schedule.Metadata<number, RetryScheduleInput>) => {
				const delayMs = getRetryDelayMs(input, attempt, policy, randomInt);
				return options.delay
					? options.delay(input, attempt, delayMs)
					: Effect.succeed(Duration.millis(delayMs));
			},
		),
	);
}
