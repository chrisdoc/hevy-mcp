---
"hevy-mcp": minor
---

Add OpenTelemetry instrumentation with dual export to Sentry and an
OTel Collector (forwarding to Honeycomb).

- New `src/utils/telemetry.ts` initializes OpenTelemetry with a custom
  tracer provider that has dual span processors: `SentrySpanProcessor`
  for Sentry (errors + traces) and `BatchSpanProcessor` with
  `OTLPTraceExporter` for the OTel Collector (traces).
- New `src/utils/metrics.ts` defines metric instruments (counters and
  histograms) for tool invocations, errors, duration, API calls, API
  latency, stdio parse errors, and server startups.
- Migrated all `Sentry.startSpan()` calls to the OpenTelemetry API
  (`tracer.startActiveSpan()`) for vendor-neutral span creation.
  Spans are still exported to Sentry via the `SentrySpanProcessor`.
- Added axios interceptors to `hevyClientKubb.ts` for automatic HTTP
  tracing and metrics recording on every Hevy API call.
- The collector endpoint and auth token are injected at build time
  from the `OTEL_COLLECTOR_ENDPOINT` and `OTEL_COLLECTOR_TOKEN`
  GitHub secrets via `tsdown.config.ts` define. Traces and metrics
  are sent to the OTel Collector, which forwards them to Honeycomb.
- Sentry remains the error monitoring backend (captureException,
  setUser, withScope, wrapMcpServerWithSentry).
