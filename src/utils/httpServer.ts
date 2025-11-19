/**
 * Legacy placeholder exported to provide a clear error for downstream consumers.
 * HTTP transport support has been removed from hevy-mcp and only stdio mode is supported.
 */
export function createHttpServer(): never {
	throw new Error(
		"HTTP transport mode has been removed from hevy-mcp. Please connect via stdio.",
	);
}
