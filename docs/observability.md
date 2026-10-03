# Observability through the OpenTelemetry Collector

Cloudflare exports Worker logs and traces over OTLP to the project's own
OpenTelemetry Collector. The collector owns downstream routing, processing,
and storage integration. This repository does not require ClickStack,
ClickHouse tables, or a particular telemetry storage backend.

Node traces and metrics also use the configured collector. Node and Worker
packages have independent release versions; compare each service against its
own deployment rather than assuming their versions match.

## Runtime signals

- **Worker:** `packages/worker/cloudflare.config.ts` enables Cloudflare
  observability and issue detection. `CLOUDFLARE_OTEL_LOGS_DESTINATIONS` and
  `CLOUDFLARE_OTEL_TRACES_DESTINATIONS` select account-level OTLP destinations
  pointing at the collector. The root config re-exports the Worker config.
  Structured request/tool completion events and custom `mcp.tool.*` and
  `mcp.prompt.*` spans provide application context without an additional
  Worker telemetry exporter or Sentry SDK.
- **Node:** emits application traces, counters, and histograms to the
  collector, with actionable exceptions sent through its separate Sentry
  integration. `HEVY_MCP_TELEMETRY=0` disables project telemetry.
- **CLI:** emits optional structured stderr events with `HEVY_CLI_LOG=true`;
  it has no persistent log sink or remote telemetry exporter.

Cloudflare Real-Time Issue Detection is enabled with
`observability.issues.enabled: true`, including in `wrangler.test.jsonc`.
It is a Cloudflare-native signal separate from OTLP export. Known failures
use privacy-safe messages for grouping; expected client-side transport
rejections are warnings, while server-side failures are errors. See
[the safe diagnostic formatter](../packages/core/src/diagnostics/safe-log-message.ts)
and [Worker request handling](../packages/worker/src/worker.ts).

Current Cloudflare OTLP export supports logs and traces. The October 2, 2026
[observability announcement](https://blog.cloudflare.com/one-observability-platform/)
identifies easier OpenTelemetry metrics export as upcoming, not available
functionality. Use built-in Cloudflare request/CPU metrics in the meantime;
revisit native export when it ships rather than adding a custom Worker metrics
exporter to obtain Node metric parity.

## Cloudflare edge tracing in exported traces

[Cloudflare Traces](https://blog.cloudflare.com/cloudflare-tracing/) is in open
beta. It extends tracing beyond the Worker into the domain's request path and
can export those spans to the same collector over OTLP. Existing Worker export
settings do not enable domain-level tracing automatically.

Useful features for hevy-mcp:

| Feature                               | Value in exported traces                                                                                                                                                       | Configuration                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Platform and ruleset spans            | Identify security blocks, transformations, route selection, cache decisions, and origin/upstream time around `/mcp`. `workers_routing` measures routing, not Worker execution. | Enable tracing for the production domain and select the collector's account-level trace destination.                   |
| Worker runtime and custom spans       | Show handler, outbound fetch, KV, and existing MCP tool/prompt operations inside the platform trace.                                                                           | Keep Worker tracing enabled as well as domain tracing. Verify the trace hierarchy in the receiving backend.            |
| Trace Rules                           | Capture more `/mcp` traffic during an investigation without increasing tracing for the whole domain. Sampling controls the traces produced and exported.                       | Use a modest baseline and a temporary higher-rate hostname/path rule. The first matching rule wins.                    |
| W3C trace context                     | Join Cloudflare spans with a caller's existing trace or an instrumented origin's spans.                                                                                        | Configure incoming context and forwarding to origin separately; export participating services to the same destination. |
| Export without Cloudflare persistence | Keep exported traces in the existing telemetry pipeline without also storing them in Cloudflare.                                                                               | Select the export destination and disable `Persist to Cloudflare` if Cloudflare-side trace search is not needed.       |

Start with domain tracing and export to the existing collector, retaining the
Worker tracing configuration. Use a path-based rule for `/mcp` and verify both
platform and MCP spans arrive before tuning the baseline sampling rate. No
Worker code change is needed to collect the supported platform spans.

Incoming context defaults to `Reject`. Cloudflare does not currently
authenticate incoming trace context; keep that default unless joining caller
traces is needed and the trust implications are understood. Context forwarding
only connects already-instrumented services; it cannot expose Hevy's internal
processing. Origin forwarding should not be assumed to propagate context on
every outbound Worker fetch; verify the actual path before relying on it.

Preserve native `trace_id`, `span_id`, parent IDs, resource attributes, and span
events through the collector. A service-name rewrite must not change those
identifiers. Supported spans appear only when their operation executes; a
missing cache/origin span is not necessarily an export failure.

Authenticated context propagation, trace-on-demand, more product spans, and
additional Workers OpenTelemetry APIs are listed as future work in the tracing
announcement. Do not treat them as available configuration options. The
existing code already uses Cloudflare's custom-span API; that is distinct from
future APIs for getting current context or enriching existing platform spans.

Sources: [trace configuration](https://developers.cloudflare.com/observability/traces/configuration/),
[span reference](https://developers.cloudflare.com/observability/traces/spans/),
and [OTLP export](https://developers.cloudflare.com/observability/export/opentelemetry/).

## Collector and receiving-backend verification

After a deployment or export change, make a bounded read-only request and
check fresh telemetry in the collector and its configured receiving backend:

1. Confirm the trace destination accepts data and that collector receiver,
   processor, and exporter errors are absent.
2. Inspect an exported trace for platform spans and Worker/MCP spans with the
   same trace ID and valid parent relationships. With head sampling below
   100%, one request may not be selected; use a temporary targeted rule for
   a bounded verification and then restore it.
3. Confirm Worker spans retain `faas.version` and the immutable
   `cloudflare.script_version.id`. If the documented collector transform is
   installed, they also have `service.name=hevy-worker` and a corresponding
   `service.version`. Edge-only spans need not carry a Worker release tag.
4. Confirm Node spans keep their original service name and version, and that
   keys, request arguments, Hevy response data, and raw personal data have not
   been added to exported attributes.

See [Worker version attribution](./cloudflare-worker-version-attribution.md)
for the collector transform. Cloudflare Logs, SQL queries, and custom alerts
are additional Cloudflare-side tools; they do not require replacing the
collector. Disabling Cloudflare persistence means that exported-only traces
are not available for Cloudflare-side trace search.

## Node metric views

Build these views in the backend receiving collector output using its native
query interface. Filter by `service.name=hevy-mcp` and the Node
`service.version`; retain `service.instance.id` for process troubleshooting
rather than using it as a default grouping dimension.

| View                        | Instruments and aggregation                                                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server and session rates    | Sum delta points from `mcp.server.startups`, `mcp.session.started`, and `mcp.session.ended` over a time window.                                                                                            |
| Tool volume and outcomes    | Sum `mcp.tool.invocations` and `mcp.tool.outcomes`; group by `tool_name`, `hevy.feature`, `transport`, bounded client/protocol metadata, and `outcome`.                                                    |
| Tool failure ratio          | Divide non-success `mcp.tool.outcomes` by all tool outcomes over the same window; handle an empty denominator explicitly.                                                                                  |
| Hevy API volume and retries | Sum `hevy.api.calls`; group by normalized `endpoint`, `method`, `status_code`, `retry_count_bucket`, `transport`, and `outcome`.                                                                           |
| Latency                     | Aggregate histograms from `mcp.tool.duration_ms` and `hevy.api.duration_ms` using backend-supported quantiles. Preserve explicit bounds and the overflow bucket; bucket-derived percentiles are estimates. |
| Freshness                   | Check the newest metric timestamp for the service/release against the expected export cadence; Node exports metrics every 30 seconds.                                                                      |

The metric exporter emits delta temporality. Sum delta points over the selected
window; do not apply cumulative-to-delta conversion again. Worker tool
failures should be investigated through completion events or span outcomes,
not solely HTTP status: an MCP error can be carried in an HTTP 200 response.
Sampled spans alone are not an exact census of tool invocations.

## Privacy and exemplars

Do not add session IDs, API keys, request arguments, response values, cache
keys, or literal Hevy IDs to metric attributes. The process-only
`service.instance.id` is a resource attribute, not an instrument label.

The current metrics implementation does not configure trace exemplars through
a supported public SDK API. Metric views therefore remain independent of
trace lookup; add exemplars only as a separately validated SDK change.

Beginning December 1, 2026, Cloudflare's announced observability pricing changes
apply to ingested/stored telemetry. Review sampling, log volume, and whether
Cloudflare persistence is useful alongside collector export. Longer retention
and OTLP metric export remain announced follow-ups.
