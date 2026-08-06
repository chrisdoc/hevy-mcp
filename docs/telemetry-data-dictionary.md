# Telemetry data dictionary

This dictionary describes the low-cardinality application telemetry contract.
It is not an exception-message redaction policy. The Node package emits
standard OpenTelemetry exception events for enabled telemetry, and the
versioned OTel Collector applies credential redaction at export time. Set
`HEVY_MCP_TELEMETRY=0` to opt out of local Sentry and OTLP telemetry entirely.

Metrics and explicit structural attributes remain bounded because that is an
OpenTelemetry cardinality requirement, not a second privacy sanitizer. Raw
exception messages and stacktraces belong to trace exception events, not metric
labels or custom span attributes.

## Approved bounded dimensions

| Field                          | Allowed values                                                                               | Applies to                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `hevy.feature`                 | `workouts`, `routines`, `templates`, `measurements`, `folders`, `profile`, `workflows`       | Tool spans and tool metrics                   |
| `mcp.tool.kind`                | `read`, `write`                                                                              | Tool spans and tool metrics                   |
| `mcp.tool.operation`           | `list`, `get`, `search`, `create`, `update`, `count`, `sync`                                 | Tool spans and tool metrics                   |
| `outcome` / `mcp.tool.outcome` | `success`, `returned_error`, `thrown_error`                                                  | Tool outcome and duration metrics; tool spans |
| `error_type`                   | `API_ERROR`, `RATE_LIMIT`, `VALIDATION_ERROR`, `NOT_FOUND`, `NETWORK_ERROR`, `UNKNOWN_ERROR` | Tool error metrics                            |
| Result count buckets           | `0`, `1`, `2-10`, `11-50`, `51+`                                                             | Result-shape spans and tool duration metrics  |
| Retry count buckets            | `0`, `1`, `2-10`, `11-50`, `51+`                                                             | API spans and API calls/duration metrics      |
| Session termination            | `clean`, `startup_failure`, `connect_failure`, `tool_failure`, `unknown`                     | Session metrics                               |
| Session duration buckets       | `<1s`, `1-10s`, `10-60s`, `1-5m`, `5m+`                                                      | Session metrics                               |
| Tool-call buckets              | `0`, `1`, `2-10`, `11-50`, `51+`                                                             | Session metrics                               |
| Cache status                   | `hit`, `miss`, `not-used`                                                                    | Workflow spans                                |
| API method                     | HTTP method                                                                                  | API spans and metrics                         |
| API endpoint                   | Normalized route for metrics; trace routes are retained for operational debugging            | API spans and metrics                         |
| HTTP status                    | Numeric status code                                                                          | API diagnostics and metrics                   |

API error categories, codes, and status values are low-cardinality operational
attributes. They are never metric dimensions when they can contain an
unbounded upstream value. Exception messages and stacktraces are emitted only
on standard OTel exception events; the Collector owns their export-time
credential redaction.
The exact tool name remains available as `mcp.tool.name` / `tool_name` only
for short-lived debugging. Access is limited to repository maintainers and
the on-call operator for at most 24 hours; it must not appear in saved
product or reliability dashboards, queries, or exports. It is not a product
taxonomy dimension.

## Structural fields

The tool wrapper may record argument key names from the fixed schema, total
argument-key count as a bucket, and the following structural values:

- presence flags for IDs, dates, timestamps, queries, and muscle-group filters;
- count buckets for pagination and limit fields;
- booleans such as `includeCustom` and `refresh`;
- result content-block count and structured-content presence;
- result item, exercise, and set count buckets;
- workflow page counts, bounded workflow name, cache status, and `items_scanned`.

These fields describe shape only. They never contain a value from the argument
or result body.

## Session and client fields

The stdio initialize message may provide client name, client version, and MCP
protocol version. Each value is trimmed, restricted to the safe token
character set `[A-Za-z0-9._+:/@-]`, and limited to 64 characters; malformed or
missing values become `unknown`. The transport is always `stdio` for this
path. Metrics never contain a session ID, request ID, progress token, prompt,
argument, or result.
The server version is supplied by the service resource (`service.version`)
and server lifecycle spans. Cloudflare-native telemetry is normalized at the
collector from the deployment tag in `faas.version` only when
`service.version` is absent. The same guarded transform gives Worker spans the
telemetry-only service name `hevy-worker`; Node remains `hevy-mcp`. See
[Cloudflare Worker version attribution](./cloudflare-worker-version-attribution.md).

The Sentry MCP wrapper is configured with input/output capture disabled. Sentry
receives generic error events and is kept independent from the OTLP exception
path. No API-key-derived user identity is attached to spans.

## Explicitly prohibited fields

Application code must not put these values in explicit attributes, logs, or MCP
responses:

- MCP prompts, prompt arguments, tool arguments, or tool result text;
- raw queries, workout/routine/folder/exercise-template IDs, request IDs, or
  progress tokens;
- workout titles, descriptions, notes, exercise names, routine names, or folder
  names;
- exact dates or timestamps from tool arguments or returned records;
- body measurements, weights, reps, distances, durations, or other measurement
  values;
- arbitrary client metadata or unnormalized endpoint paths.

## Regression guard

`packages/node/src/index.test.ts`, `packages/node/src/utils/telemetry.test.ts`,
`packages/node/src/utils/tool-observer.test.ts`,
`packages/node/src/utils/stdio-observability.test.ts`,
and `packages/node/src/utils/mcp-session-observability.test.ts` assert the capture settings,
low-cardinality attributes, native exception recording, opt-out behavior, and
secret-sentinel absence from explicit application fields. Collector config and
repository tests cover export-time credential redaction. Any telemetry field
change must update this dictionary and its regression tests in the same change.
