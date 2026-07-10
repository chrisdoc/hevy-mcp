---
"hevy-mcp": major
---

Change the public `createServer` factory to return a `Promise<McpServer>` so it
can validate the configured Hevy API key before constructing a server. Reject
confirmed authentication failures with a sanitized error, while warning with
allowlisted diagnostics and continuing startup for other validation failures.
