import type { HevyHttpError } from "./hevy-http-error.js";

export const RETRY_BACKOFF_MAX_MS = 5_000;

export interface RetryPolicy {
	readonly maxRetries: number;
	readonly baseDelayMs: number;
	readonly maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
	maxRetries: 3,
	baseDelayMs: 300,
	maxDelayMs: RETRY_BACKOFF_MAX_MS,
};

export function parseRetryAfterMs(
	value: string | null,
	now = Date.now(),
): number | undefined {
	if (!value) return undefined;
	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return Math.round(seconds * 1_000);
	}
	const dateMillis = Date.parse(value);
	return Number.isNaN(dateMillis) ? undefined : Math.max(0, dateMillis - now);
}

/**
 * Calculate the next retry delay without performing I/O.
 *
 * Keeping this policy pure makes it independently testable and provides the
 * seam for replacing the imperative retry loop with an Effect Schedule.
 */
export function getRetryDelayMs(
	error: Pick<HevyHttpError, "status" | "headers">,
	retryAttempt: number,
	policy: RetryPolicy = DEFAULT_RETRY_POLICY,
	randomInt = (maxExclusive: number) =>
		Math.floor(Math.random() * maxExclusive),
): number {
	const exponential = Math.min(
		policy.maxDelayMs,
		policy.baseDelayMs * 2 ** Math.max(0, retryAttempt - 1),
	);
	const retryAfter =
		error.status === 429
			? parseRetryAfterMs(error.headers?.get("retry-after") ?? null)
			: undefined;
	const lowerBound =
		retryAfter === undefined ? exponential : Math.max(exponential, retryAfter);
	const jitterLimit =
		retryAfter === undefined
			? 250
			: Math.min(250, Math.max(1, retryAfter * 0.1));
	const jitter = randomInt(Math.ceil(jitterLimit));
	return lowerBound + jitter;
}
