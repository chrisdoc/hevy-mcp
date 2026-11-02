---
"@hevy-mcp/core": patch
"@hevy-mcp/worker": patch
"hevy-mcp": patch
---

Update production dependencies: MCP SDK server 2.4.0 and Node adapter 2.1.2, `@opentelemetry/api` 1.10.0, and Sentry 11.9.0.

The OpenTelemetry SDK and OTLP exporters stay on 2.12/0.223 because `@effect/opentelemetry` caps its peer ranges below the 3.0/0.300 line.
