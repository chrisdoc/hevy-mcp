---
"hevy-mcp": patch
---

Disable project telemetry by default for unbuilt Node source runs unless HEVY_MCP_TELEMETRY=1 is explicitly set. Preserve published-build opt-out behavior and label enabled source-run Sentry events as development, with SENTRY_ENVIRONMENT available as an override.
