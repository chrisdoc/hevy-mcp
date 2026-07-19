# Privacy-reviewed telemetry dashboards

These panels use only the fields in the
[telemetry data dictionary](./telemetry-data-dictionary.md). The examples use
Honeycomb-style metric names and dimensions; Sentry span panels should apply
the equivalent span attribute filters.

## Product usage

| Panel                  | Source                 | Grouping/filter                                               | Question answered                                            |
| ---------------------- | ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| Feature adoption       | `mcp.tool.invocations` | `hevy.feature`, `mcp.tool.operation`                          | Which Hevy areas and operations are used?                    |
| Read/write split       | `mcp.tool.invocations` | `mcp.tool.kind`                                               | Are users primarily reading or writing?                      |
| Discovery entry points | `mcp.tool.invocations` | `mcp.tool.operation = search`, `mcp.tool.name`                | Which bounded search tools start workflows?                  |
| Workflow adoption      | `mcp.tool.invocations` | `hevy.feature = workflows`, `mcp.tool.operation`              | How often are training summaries and routine discovery used? |
| Write adoption         | `mcp.tool.invocations` | `mcp.tool.kind = write`, `hevy.feature`, `mcp.tool.operation` | How frequently are writes made by feature?                   |

Example aggregate query:

```text
COUNT mcp.tool.invocations
GROUP BY hevy.feature, mcp.tool.kind, mcp.tool.operation
WHERE transport = "stdio"
```

## Tool reliability

| Panel                       | Source                 | Grouping/filter                                                | Question answered                                             |
| --------------------------- | ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| User-visible outcome rate   | `mcp.tool.outcomes`    | `mcp.tool.name`, `outcome`                                     | Which tools return MCP errors versus succeed?                 |
| Thrown-error rate           | `mcp.tool.errors`      | `mcp.tool.name`, `error_type`                                  | Which tools raise uncaught failures?                          |
| Client compatibility        | `mcp.tool.outcomes`    | `client_name`, `client_version`, `protocol_version`, `outcome` | Which sanitized client/protocol combinations fail more often? |
| Tool latency                | `mcp.tool.duration_ms` | `hevy.feature`, `mcp.tool.operation`, `outcome`                | Which bounded feature operations are slow?                    |
| Result shape versus latency | `mcp.tool.duration_ms` | `mcp.tool.result.item_count_bucket`, `hevy.feature`            | Do large result shapes correlate with latency?                |

Returned `isError: true` responses use `outcome=returned_error`; thrown
exceptions use `outcome=thrown_error`. Do not infer user-visible failure rate
from `mcp.tool.errors` alone.

## Hevy API reliability

| Panel                     | Source                 | Grouping/filter                                                     | Question answered                                             |
| ------------------------- | ---------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| API status friction       | `hevy.api.calls`       | normalized `endpoint`, `status_code`, `method`                      | Which endpoint/status pairs fail?                             |
| Stale-resource signals    | `hevy.api.calls`       | `status_code = 404`, normalized `endpoint`                          | Are 404s concentrated in resource lookup or pagination?       |
| Conflicting writes        | `hevy.api.calls`       | `status_code = 409`, normalized `endpoint`, `method`                | Are duplicate/conflicting writes concentrated in one feature? |
| Retry and timeout signals | `hevy.api.calls`       | `status_code`, `retry_count_bucket`, `error_category`, `error_code` | How often do retries, rate limits, and timeouts occur?        |
| API duration              | `hevy.api.duration_ms` | normalized `endpoint`, `method`                                     | Which API operations are slow?                                |

Endpoints are normalized before telemetry. Dynamic path segments are replaced
with placeholders; raw IDs never reach these panels.

## Performance and workflows

| Panel                         | Source                                                      | Grouping/filter                                 | Question answered                                                      |
| ----------------------------- | ----------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| Workflow pages scanned        | `mcp.tool.get-training-summary`, `mcp.tool.search-routines` | `workflow.pagination.*.pages`                   | Which workflows scan the most pages?                                   |
| Cache hit/miss                | `mcp.tool.get-training-summary`, `mcp.tool.search-routines` | `workflow.cache_status`                         | How effective is catalog caching?                                      |
| Workflow scan versus duration | `mcp.tool.get-training-summary`, `mcp.tool.search-routines` | `workflow.items_scanned`                        | Does scan size correlate with latency?                                 |
| Session lifecycle             | `mcp.session.started`, `mcp.session.ended`                  | sanitized client fields, `termination_category` | Do sessions end cleanly or fail during startup/connect/tool execution? |
| Session shape                 | `mcp.session.ended`                                         | `session_duration_bucket`, `tool_calls_bucket`  | How long are sessions and how many tools do they call?                 |

## Retention and access review

Approved application policy for these dashboards:

- aggregate metrics: 90 days;
- Sentry/OTel traces containing sanitized client metadata or the pseudonymous
  user hash: 30 days;
- user-hash troubleshooting views: 24 hours of access and no saved per-user
  dashboard or query;
- dashboard access owners: repository maintainers and the on-call operator;
- no export of prompt, argument, result, title, notes, dates, identifiers, or
  measurements.

Backend retention settings must be configured to match this policy before a
panel is published. A review owner must re-check the Sentry MCP options and the
telemetry dictionary whenever the SDK or dashboard definitions change.

## Publication checklist

Automated guards that must remain green:

- [x] Sentry MCP input capture is explicitly disabled; `src/index.test.ts`
      asserts `recordInputs: false`.
- [x] Sentry MCP output capture is explicitly disabled; `src/index.test.ts`
      asserts `recordOutputs: false`.
- [x] Metric dimensions have fixed taxonomies or bounded sanitization;
      `src/tools/register.test.ts` and `src/utils/telemetry-wrapper.test.ts`
      cover the declared fields.
- [x] Raw queries, IDs, dates, titles, notes, descriptions, and measurements
      are excluded; privacy regression tests assert secret-sentinel absence.
- [x] Returned MCP errors and thrown errors have separate outcomes;
      `src/utils/telemetry-wrapper.test.ts` covers both paths.
- [x] Session termination and sanitized client/protocol fields are covered by
      `src/utils/mcp-session-observability.test.ts`.
- [x] Backend retention and dashboard access policy are documented above.

Before publishing or changing a panel:

- [ ] Configure backend retention to the policy above.
- [ ] Confirm repository maintainers and the on-call operator own access.
- [ ] Re-run the privacy regression tests and re-review the data dictionary
      whenever Sentry, OpenTelemetry, or dashboard definitions change.
