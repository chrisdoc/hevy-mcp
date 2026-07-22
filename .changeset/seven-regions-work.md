---
"hevy-mcp": major
---

The Node package now publishes a runtime-neutral MCP server behind
`createNodeMcpServer({ apiKey })` and `runStdioServer()`. The default export,
`createServer`, `runServer`, and `configSchema` are removed. Consumers that
used the old programmatic API should pass the API key explicitly and choose
whether their application owns a transport or uses the built-in stdio runner.
