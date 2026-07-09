---
"hevy-mcp": patch
---

Make Sentry observability configurable while preserving the default enabled
behavior. Add `HEVY_MCP_ENABLE_SENTRY` opt-out support (`false`, `0`, `no`,
`off`), support `SENTRY_DSN` overrides, and skip startup Sentry spans/wrappers
when disabled.
