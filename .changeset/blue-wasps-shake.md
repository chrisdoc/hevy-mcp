---
"hevy-mcp": patch
---

Align MCP tool response helpers with SDK `CallToolResult` typing by
replacing the loose custom response interface, narrowing helper content to
SDK `TextContent[]`, and ensuring JSON responses always emit string text.
