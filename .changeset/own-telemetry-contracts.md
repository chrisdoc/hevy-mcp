---
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Own the telemetry contract constants (user hash context, hash shape, argument-key allowlist) in core so the Node and Worker adapters cannot drift apart.
