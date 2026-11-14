---
"@hevy-mcp/hevy-client": patch
"@hevy-mcp/operations": patch
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Regenerate the Hevy client with Kubb 5.15.4, add the new `withActiveSpan`
tracing member to the Worker and test execution-context doubles, and align the
type-aware lint exclusion for the Kubb config with the format script.
