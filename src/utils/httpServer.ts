/**
 * Legacy placeholder exported to provide a clear error for downstream consumers.
 * HTTP transport support has been removed from hevy-mcp and only stdio mode is supported.
 */
export function createHttpServer(): never {
	throw new Error(`HTTP/SSE transport has been removed from hevy-mcp (since v1.18.0).
The server now only supports stdio transport.

To fix this:
1. Update to the latest version: npx -y hevy-mcp@latest
2. Update your client configuration to use stdio instead of HTTP/SSE
3. Follow the migration guide (includes client examples):
   https://github.com/chrisdoc/hevy-mcp#migration-from-httpsse-transport
`);
}
