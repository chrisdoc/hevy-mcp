---
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Guard `mergeAbortSignals` with an `AbortSignal.any` capability check and a manual composition fallback so self-hosted Node runtimes older than 20.3 no longer fail every tool dispatch with `TypeError: AbortSignal.any is not a function`.
