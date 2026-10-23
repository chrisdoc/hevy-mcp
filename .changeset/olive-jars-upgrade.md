---
"@hevy-mcp/hevy-client": patch
"@hevy-mcp/operations": patch
"@hevy-mcp/core": patch
"@hevy-mcp/worker": patch
"hevy-mcp": patch
"@chrisdoc/hevy-cli": patch
---

Upgrade workspace dependencies to their latest compatible releases: Effect 4.0.6, kubb 5.12 codegen, Nx 24, Cloudflare tooling (`@cloudflare/config` 0.28, `cf` beta.20), Sentry 11.9, oxlint 1.89, oxfmt 0.74, and the remaining patch updates.

Compatibility notes:

- `@cloudflare/vite-plugin` stays on 1.64 because 1.65 removes `cloudflare.config.ts` support from the v1 plugin.
- `@opentelemetry/api` stays on 1.9.1 and the OpenTelemetry SDK stays on 2.12/0.223 because the installed `@effect/opentelemetry` peer range caps them below the 3.0/1.10 line.
- The kubb upgrade regenerates the client with an exported `defaultTransport` and no other output change.
