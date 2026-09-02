import { Duration, Effect, Schedule } from "effect";

import type { HevyHttpError } from "./hevy-http-error.js";
import {
	DEFAULT_RETRY_POLICY,
	getRetryDelayMs,
	type RetryPolicy,
} from "./retry-policy.js";

export type RetryScheduleInput = Pick<HevyHttpError, "status" | "headers">;

/**
 * Builds the Effect schedule used by retrying client programs.
 *
 * The schedule deliberately only owns retry timing and the retry count. The
 * client remains responsible for deciding whether an error is safe to retry,
 * preserving its HTTP execution metadata and observation lifecycle.
 */
export function createRetrySchedule(
	maxRetries: number,
	policy: RetryPolicy = DEFAULT_RETRY_POLICY,
	randomInt = (maxExclusive: number) =>
		Math.floor(Math.random() * maxExclusive),
): Schedule.Schedule<number, RetryScheduleInput> {
	return Schedule.recurs(Math.max(0, maxRetries)).pipe(
		Schedule.addDelay((metadata) =>
			Effect.sync(() => {
				return Duration.millis(
					getRetryDelayMs(metadata.input, metadata.attempt, policy, randomInt),
				);
			}),
		),
	);
}
