import {
	createExecutionProjection,
	createSafeErrorDiagnostic,
} from "@hevy-mcp/core";

/**
 * Render one privacy-safe execution projection for Worker HTTP adapters.
 * Callers choose the transport-specific status and message; the outcome
 * fields always come from the shared core/client taxonomy.
 */
export function executionResponse(
	error: unknown,
	message: string,
	status: number,
): Response {
	const execution = createExecutionProjection(createSafeErrorDiagnostic(error));
	return new Response(JSON.stringify({ error: { message, ...execution } }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

export function executionStatus(error: unknown, fallback: number): number {
	const outcome = createSafeErrorDiagnostic(error).outcome;
	if (outcome === "deadline_exceeded") return 504;
	if (outcome === "cancelled") return 499;
	return fallback;
}
