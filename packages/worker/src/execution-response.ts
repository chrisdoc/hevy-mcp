import { createExecutionErrorProjection } from "@hevy-mcp/core";
import { z } from "zod";

export interface ExecutionOutcome {
	readonly execution: ReturnType<typeof createExecutionErrorProjection>;
	readonly status: number;
}

type ExecutionErrorInput = Parameters<typeof createExecutionErrorProjection>[0];

/** Compute one bounded projection and transport status for a failure. */
export function executionOutcome(
	error: ExecutionErrorInput,
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
	error: ExecutionErrorInput,
	message: string,
	statusOrOutcome: number | ExecutionOutcome,
): Response {
	const parsedStatus = z.number().safeParse(statusOrOutcome);
	if (parsedStatus.success) {
		const outcome = executionOutcome(error, parsedStatus.data);
		return new Response(
			JSON.stringify({ error: { message, ...outcome.execution } }),
			{
				status: outcome.status,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
	const outcome = statusOrOutcome as ExecutionOutcome;
	return new Response(
		JSON.stringify({ error: { message, ...outcome.execution } }),
		{
			status: outcome.status,
			headers: { "Content-Type": "application/json" },
		},
	);
}

export function executionStatus(
	error: ExecutionErrorInput,
	fallback: number,
): number {
	return executionOutcome(error, fallback).status;
}
