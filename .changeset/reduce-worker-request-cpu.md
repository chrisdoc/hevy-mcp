---
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Reduce per-request CPU in the Worker: memoize tool schema registration once per isolate and preload it at module scope, avoiding the repeated compact-JSON-Schema conversion that caused intermittent `Worker exceeded CPU time limit` (503) responses.
