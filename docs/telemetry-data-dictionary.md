# Privacy-aware telemetry data dictionary

This dictionary is the contract for Sentry error events and OpenTelemetry
traces and metrics. Structured fields must remain allowlisted or bounded.
Actionable exception messages and stacks are allowed only after the centralized
Node failure reporter scrubs and length-limits them. The Collector remains a
final defense-in-depth scrubber.

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
| API method                     | HTTP method from the client allowlist                                                        | API spans and metrics                         |
| API endpoint                   | Normalized static endpoint or a placeholder path containing no identifier                    | API spans and metrics                         |
| HTTP status                    | Numeric status code                                                                          | API diagnostics and metrics                   |
| Error expectedness             | Boolean; expected failures are not sent to Sentry                                            | Failure spans                                 |
| Correlation IDs                | OTel trace/span IDs, Sentry event ID, and opaque per-failure ID; never a user identity       | Failure events and traces                     |
| `user.hash`                    | Ten-character lowercase HMAC pseudonym; never the raw Hevy API key                           | Hosted Worker MCP activity spans              |
| `cloudflare.colo`              | Three-letter Cloudflare edge colo; a regional proxy, not exact user geography                | Hosted Worker MCP activity spans              |

API error categories and codes are emitted only after
`createSafeErrorDiagnostic` normalization. Categories are the finite
`SafeErrorCategory` union; codes are the finite allowlist in `error-policy.ts`.
Diagnostic messages and stacks are separate Sentry/trace detail fields and are
scrubbed by the Node failure reporter before export.
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
argument, result, or API-key-derived identity. Hosted Worker MCP activity spans
may carry `user.hash` for distinct-user analysis and `cloudflare.colo` only when
Cloudflare supplies it on the request. The hash is pseudonymous, and the colo is
an edge point of presence rather than the user's location.
The server version is supplied by the service resource (`service.version`)
and server lifecycle spans. Cloudflare-native telemetry is normalized at the
collector from the deployment tag in `faas.version` only when
`service.version` is absent. The same guarded transform gives Worker spans the
telemetry-only service name `hevy-worker`; Node remains `hevy-mcp`. See
[Cloudflare Worker version attribution](./cloudflare-worker-version-attribution.md).

Sentry is used for error events rather than performance tracing. The Node
failure reporter does not capture MCP inputs or outputs. Its `beforeSend` hook
removes request, user, breadcrumb, extra, untrusted context, and unsanitized
stack fields before Sentry export. OTel trace and span IDs may be attached to
Sentry events to connect an issue to its Honeycomb trace.

## Explicitly prohibited fields

Never send or inspect for telemetry:

- MCP prompts, prompt arguments, tool arguments, or tool result text;
- API keys, bearer tokens, authorization headers, request bodies, or response
  bodies;
- raw queries, workout/routine/folder/exercise-template IDs, request IDs, or
  progress tokens;
- workout titles, descriptions, notes, exercise names, routine names, or folder
  names;
- exact dates or timestamps from tool arguments or returned records;
- body measurements, weights, reps, distances, durations, or other measurement
  values;
- raw client IP addresses or exact location data;
- arbitrary client metadata or unnormalized endpoint paths.

## Regression guard

`packages/node/src/index.test.ts`,
`packages/node/src/utils/failure-reporter.test.ts`,
`packages/node/src/utils/telemetry.test.ts`,
`packages/node/src/utils/tool-observer.test.ts`,
`packages/node/src/utils/stdio-observability.test.ts`, and
`packages/node/src/utils/mcp-session-observability.test.ts` assert provider
configuration, allowlisted attributes, sanitized client metadata, one-event
ownership, and secret-sentinel absence. Any telemetry field change must update
this dictionary and its regression tests in the same change.
