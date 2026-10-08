import type { HevyExecutionOptions } from "@hevy-mcp/hevy-client";
import { ApiError, NotFoundError, RateLimitError } from "@hevy-mcp/hevy-client";
import { Effect } from "effect";

export function httpError(status: number, method: string, endpoint: string) {
	if (status === 404) {
		return new NotFoundError({ status, method, endpoint, expected: true });
	}
	if (status === 429) {
		return new RateLimitError({ status, method, endpoint });
	}
	return new ApiError({ status, method, endpoint });
}

export function abortable<T>(
	options: HevyExecutionOptions | undefined,
	error: Error,
): Effect.Effect<T> {
	const signal = options?.signal;
	if (signal === undefined) return Effect.die(error);
	return Effect.callback((resume) => {
		const rejectOnAbort = () => {
			signal.removeEventListener("abort", rejectOnAbort);
			const reason = signal.reason;
			resume(Effect.die(reason instanceof Error ? reason : error));
		};
		if (signal.aborted) {
			rejectOnAbort();
		} else {
			signal.addEventListener("abort", rejectOnAbort, { once: true });
		}
		return Effect.sync(() =>
			signal.removeEventListener("abort", rejectOnAbort),
		);
	});
}
