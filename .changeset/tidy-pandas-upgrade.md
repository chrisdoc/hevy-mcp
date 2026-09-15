---
"@hevy-mcp/hevy-client": patch
"@hevy-mcp/operations": patch
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Manual dependency upgrade (Dependabot is blocked on pnpm 12): zod 4.5.4 to 4.6.5, effect 4.0.0-rc.112 to 4.0.0-rc.115, wrangler 4.128.0 to 4.131.2, plus dev-dependency updates. Adapt Worker tracing doubles to the new @cloudflare/workers-types Span API.
