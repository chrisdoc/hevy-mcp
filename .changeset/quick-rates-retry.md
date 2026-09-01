---
"@hevy-mcp/hevy-client": patch
"@hevy-mcp/operations": patch
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Give retried API requests fresh per-attempt timeout windows and add bounded jitter to transient retry backoff, reducing synchronized HTTP 429 retries while preserving write safety policy.
