---
"hevy-mcp": minor
---

Add OpenTelemetry instrumentation with dual export to Sentry and Honeycomb.

- New `src/utils/telemetry.ts` initializes OpenTelemetry with a custom
  tracer provider that has dual span processors: `SentrySpanProcessor`
  for Sentry (errors + traces) and `BatchSpanProcessor` with
  `OTLPTraceExporter` for Honeycomb (traces).
- New `src/utils/metrics.ts` defines metric instruments (counters and
  histograms) for tool invocations, errors, duration, API calls, API
  latency, stdio parse errors, and server startups.
- Migrated all `Sentry.startSpan()` calls to the OpenTelemetry API
  (`tracer.startActiveSpan()`) for vendor-neutral span creation.
  Spans are still exported to Sentry via the `SentrySpanProcessor`.
- Added axios interceptors to `hevyClientKubb.ts` for automatic HTTP
  tracing and metrics recording on every Hevy API call.
- Honeycomb API key is injected at build time from the
  `HONEYCOMB_API_KEY` GitHub secret via `tsdown.config.ts` define,
  mirroring the Sentry DSN pattern.
- Sentry remains the error monitoring backend (captureException,
  setUser, withScope, wrapMcpServerWithSentry).
- Honeycomb receives traces and metrics for latency, throughput, and
  usage analytics.
