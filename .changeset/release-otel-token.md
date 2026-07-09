---
"hevy-mcp": patch
---

Fix missing OTEL_COLLECTOR_TOKEN in the Release workflow build step.

The Release workflow built the npm package without passing the
OTEL_COLLECTOR_TOKEN secret, so the published package had an empty
collector token. This caused the OTLP exporter to be skipped at
runtime (the `if (collectorToken)` guard in telemetry.ts), meaning
no traces or metrics were sent to the OTel Collector.
