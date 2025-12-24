/**
 * Legacy placeholder exported to provide a clear error for downstream consumers.
 * HTTP transport support has been removed from hevy-mcp and only stdio mode is supported.
 */
export function createHttpServer(): never {
	throw new Error(
		"HTTP/SSE transport has been removed from hevy-mcp (as of v1.18.0, commit 6f32a48). " +
			"The server now only supports stdio transport. " +
			"To fix this error:\n" +
			"1. Update to the latest version: npx -y hevy-mcp@latest\n" +
			"2. Update your client config to use stdio instead of HTTP/SSE\n" +
			"3. For Cursor, use this config in ~/.cursor/mcp.json:\n" +
			'   { "hevy-mcp": { "command": "npx", "args": ["-y", "hevy-mcp"], "env": { "HEVY_API_KEY": "your-key" } } }\n' +
			"4. See https://github.com/chrisdoc/hevy-mcp#migration-from-httpsse-transport for full migration guide.",
	);
}
