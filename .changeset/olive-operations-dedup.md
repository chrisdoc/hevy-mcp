---
"@hevy-mcp/operations": patch
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Deduplicate operation construction: one operation factory with derived tracing spans, unconditional options passthrough, and shared read-outcome, page-echo, and pagination helpers.
