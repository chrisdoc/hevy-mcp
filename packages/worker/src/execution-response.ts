import { createExecutionErrorProjection } from "@hevy-mcp/core";

export interface ExecutionOutcome {
	readonly execution: ReturnType<typeof createExecutionErrorProjection>;
	readonly status: number;
}

/** Compute one bounded projection and transport status for a failure. */
export function executionOutcome(
	error: unknown,
	fallback: number,
): ExecutionOutcome {
	const execution = createExecutionErrorProjection(error);
	const status =
		execution.outcome === "deadline_exceeded"
			? 504
			: execution.outcome === "cancelled"
				? 499
				: fallback;
	return { execution, status };
}

/**
 * Render one privacy-safe execution projection for Worker HTTP adapters.
 * Callers choose the transport-specific status and message; the outcome
 * fields always come from the shared core/client taxonomy.
 */
export function executionResponse(
	error: unknown,
	message: string,
	statusOrOutcome: number | ExecutionOutcome,
): Response {
	const outcome =
		typeof statusOrOutcome === "number"
			? executionOutcome(error, statusOrOutcome)
			: statusOrOutcome;
	return new Response(
		JSON.stringify({ error: { message, ...outcome.execution } }),
		{
			status: outcome.status,
			headers: { "Content-Type": "application/json" },
		},
	);
}

export function executionStatus(error: unknown, fallback: number): number {
	return executionOutcome(error, fallback).status;
}
