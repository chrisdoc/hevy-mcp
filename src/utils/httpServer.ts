/**
 * Legacy placeholder exported to provide a clear error for downstream consumers.
 * HTTP transport support has been removed from hevy-mcp and only stdio mode is supported.
 */
export function createHttpServer(): never {
	throw new Error(`HTTP/SSE transport has been removed from hevy-mcp (since v1.18.0).
The server now only supports stdio transport.

Update to the latest version:
  npx -y hevy-mcp@latest

Migration guide:
  https://github.com/chrisdoc/hevy-mcp#migration-from-httpsse-transport

Cursor example (~/.cursor/mcp.json):
  {
    "hevy-mcp": {
      "command": "npx",
      "args": ["-y", "hevy-mcp"],
      "env": {
        "HEVY_API_KEY": "your-api-key-here"
      }
    }
  }
`);
}
