# Privacy-safe telemetry data dictionary

This dictionary is the contract for Sentry spans and OpenTelemetry metrics. The
telemetry implementation must fail closed when a value is not in an allowlist
or bounded bucket.

## Approved bounded dimensions

| Field                          | Allowed values                                                                         | Applies to                                    |
| ------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------- |
| `hevy.feature`                 | `workouts`, `routines`, `templates`, `measurements`, `folders`, `profile`, `workflows` | Tool spans and tool metrics                   |
| `mcp.tool.kind`                | `read`, `write`                                                                        | Tool spans and tool metrics                   |
| `mcp.tool.operation`           | `list`, `get`, `search`, `create`, `update`, `count`, `sync`                           | Tool spans and tool metrics                   |
| `outcome` / `mcp.tool.outcome` | `success`, `returned_error`, `thrown_error`                                            | Tool outcome and duration metrics; tool spans |
| Result count buckets           | `0`, `1`, `2-10`, `11-50`, `51+`                                                       | Result-shape spans and tool duration metrics  |
| Retry count buckets            | `0`, `1`, `2-10`, `11-50`, `51+`                                                       | API spans and API calls/duration metrics      |
| Session termination            | `clean`, `startup_failure`, `connect_failure`, `tool_failure`, `unknown`               | Session metrics                               |
| Session duration buckets       | `<1s`, `1-10s`, `10-60s`, `1-5m`, `5m+`                                                | Session metrics                               |
| Tool-call buckets              | `0`, `1`, `2-10`, `11-50`, `51+`                                                       | Session metrics                               |
| Cache status                   | `hit`, `miss`, `not-used`                                                              | Workflow spans                                |
| API method                     | HTTP method from the client allowlist                                                  | API spans and metrics                         |
| API endpoint                   | Normalized static endpoint or a placeholder path containing no identifier              | API spans and metrics                         |
| HTTP status                    | Numeric status code                                                                    | API diagnostics and metrics                   |

API error categories and codes are emitted only after `createSafeErrorDiagnostic`
normalization. Categories are the finite `SafeErrorCategory` union; codes are
the finite allowlist in `error-policy.ts`. Neither field contains an upstream
message or arbitrary error value.
The exact tool name remains available as `mcp.tool.name` / `tool_name` for
short-lived debugging. It is not a product taxonomy dimension.

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
protocol version. Each value is trimmed, restricted to a safe printable
character set, and limited to 64 characters; malformed or missing values become
`unknown`. The transport is always `stdio` for this path. Metrics never contain
a session ID, request ID, progress token, prompt, argument, result, or user
hash. The server version is supplied by the service resource (`service.version`)
and server lifecycle spans.

The Sentry MCP wrapper is configured with input/output capture disabled.
`beforeSendSpan` removes MCP request/session identifiers, progress tokens,
logging/progress text, resource URIs, and unsanitized client identity fields
before Sentry export; the stdio instrumentation remains the source for the
sanitized client dimensions above.

The pseudonymous user hash is span-only correlation data. It is not a metric
dimension and must not be used to construct per-user behavior histories.

## Explicitly prohibited fields

Never send or inspect for telemetry:

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

`src/index.test.ts`, `src/utils/telemetry.test.ts`,
`src/utils/telemetry-wrapper.test.ts`, `src/utils/stdio-observability.test.ts`,
and `src/utils/mcp-session-observability.test.ts` assert the capture settings,
allowlisted attributes, sanitized client metadata, and secret-sentinel absence.
Any telemetry field change must update this dictionary and its regression tests
in the same change.
