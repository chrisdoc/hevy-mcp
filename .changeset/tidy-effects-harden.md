---
"@hevy-mcp/hevy-client": patch
"@hevy-mcp/operations": patch
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Harden Effect type safety: narrow the request error channel to tagged errors, surface bounded-execution timeouts as typed deadline failures, validate template search pagination, and return template list results as an explicit struct.
