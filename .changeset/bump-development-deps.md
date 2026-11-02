---
"@hevy-mcp/hevy-client": patch
"@hevy-mcp/operations": patch
"@hevy-mcp/core": patch
"@hevy-mcp/worker": patch
"hevy-mcp": patch
"@chrisdoc/hevy-cli": patch
---

Update development dependencies and regenerate the API client with Kubb 5.14, which tightens the custom exercise request types and adds request query/header schemas.

Compatibility notes:

- `tsdown` stays on 0.23.1 because 0.23.2 ships a `rolldown-plugin-dts` beta that cannot build declarations with TypeScript 7.0.
- `@cloudflare/vite-plugin` stays on 1.64 because 1.65 removes `cloudflare.config.ts` support from the v1 plugin.
- The Worker fallback execution context implements the new `mapVirtualHost` member from `@cloudflare/workers-types`.
