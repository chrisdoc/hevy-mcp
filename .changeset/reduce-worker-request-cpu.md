---
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Reduce per-request CPU in the Worker: memoize tool schema registration once per isolate, and preload the actual compact-JSON-Schema conversions at module scope so the first request only reads already-converted schemas. This eliminates the repeated conversion that caused intermittent `Worker exceeded CPU time limit` (503) responses.
