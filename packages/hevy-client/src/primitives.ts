/** Internal Effect request primitives, intentionally absent from package exports. */
export {
	AttemptFailure,
	attemptEffect,
	finalizeOnce,
	type AttemptFailureOptions,
} from "./attempt.js";
export {
	BackoffFailure,
	customPromiseSleep,
	effectClockSleep,
	retryBackoff,
	type BackoffFailureOptions,
} from "./backoff.js";
