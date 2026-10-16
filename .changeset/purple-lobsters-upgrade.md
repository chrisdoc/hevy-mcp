---
"@hevy-mcp/hevy-client": patch
"@hevy-mcp/operations": patch
"@hevy-mcp/core": patch
"@hevy-mcp/worker": patch
"hevy-mcp": patch
"@chrisdoc/hevy-cli": patch
---

Upgrade workspace dependencies across Effect, zod, OpenTelemetry, Sentry, the MCP SDK, kubb codegen, Cloudflare tooling, and the vitest 5 test stack. The client regenerates unchanged in shape, with kubb 5.10 emitting tighter response unions and an indexed QUERY method entry; worker span fallbacks implement the new `spanContext` member required by current workers types.
