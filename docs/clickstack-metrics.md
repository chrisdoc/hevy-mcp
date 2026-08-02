# ClickStack metric views

This query set is portable across ClickStack installations. It assumes the
standard OpenTelemetry ClickHouse tables in the `otel` database:

- `otel.otel_metrics_sum`
- `otel.otel_metrics_histogram`

The metric exporter emits delta temporality for counters and histograms. Sum
delta points directly represent the events in each export interval; do not
apply cumulative-delta logic a second time.

The queries intentionally use ClickHouse map expressions such as
`Attributes['tool_name']` and `ResourceAttributes['service.version']`. Do not
replace them with bare column references.

## Common release filter

Use this predicate in each panel to scope a release:

```sql
ResourceAttributes['service.name'] = 'hevy-mcp'
AND ResourceAttributes['service.version'] = {release:String}
```

Keep `service.instance.id` available for process-level troubleshooting, but do
not group product dashboards by it unless investigating multi-process
aggregation.

## Server and session rate

```sql
SELECT
    toStartOfInterval(TimeUnix, INTERVAL 1 MINUTE) AS minute,
    sum(Value) AS starts
FROM otel.otel_metrics_sum
WHERE MetricName = 'mcp.server.startups'
  AND ResourceAttributes['service.name'] = 'hevy-mcp'
  AND ResourceAttributes['service.version'] = {release:String}
GROUP BY minute
ORDER BY minute;
```

Change `MetricName` to `mcp.session.started` or `mcp.session.ended` for the
session lifecycle panels.

## Tool invocation and outcome rate

```sql
SELECT
    toStartOfInterval(TimeUnix, INTERVAL 1 MINUTE) AS minute,
    Attributes['tool_name'] AS tool_name,
    Attributes['hevy.feature'] AS feature,
    Attributes['transport'] AS transport,
    Attributes['client_name'] AS client_name,
    Attributes['client_version'] AS client_version,
    Attributes['protocol_version'] AS protocol_version,
    Attributes['outcome'] AS outcome,
    sum(Value) AS events
FROM otel.otel_metrics_sum
WHERE MetricName IN ('mcp.tool.invocations', 'mcp.tool.outcomes')
  AND ResourceAttributes['service.name'] = 'hevy-mcp'
  AND ResourceAttributes['service.version'] = {release:String}
GROUP BY minute, tool_name, feature, transport, client_name, client_version,
    protocol_version, outcome
ORDER BY minute, tool_name, outcome;
```

## Tool error ratio

```sql
SELECT
    sumIf(Value, MetricName = 'mcp.tool.outcomes'
        AND Attributes['outcome'] != 'success')
        / nullIf(sumIf(Value, MetricName = 'mcp.tool.outcomes'), 0) AS error_ratio
FROM otel.otel_metrics_sum
WHERE ResourceAttributes['service.name'] = 'hevy-mcp'
  AND ResourceAttributes['service.version'] = {release:String};
```

## Hevy API calls, retries, and status

```sql
SELECT
    toStartOfInterval(TimeUnix, INTERVAL 1 MINUTE) AS minute,
    Attributes['endpoint'] AS endpoint,
    Attributes['method'] AS method,
    Attributes['status_code'] AS status_code,
    Attributes['retry_count_bucket'] AS retry_count_bucket,
    Attributes['transport'] AS transport,
    Attributes['outcome'] AS outcome,
    sum(Value) AS calls
FROM otel.otel_metrics_sum
WHERE MetricName = 'hevy.api.calls'
  AND ResourceAttributes['service.name'] = 'hevy-mcp'
  AND ResourceAttributes['service.version'] = {release:String}
GROUP BY minute, endpoint, method, status_code, retry_count_bucket, transport,
    outcome
ORDER BY minute, calls DESC;
```

## Histogram latency and quantile view

The histogram table stores bucket counts. With N explicit bounds, the N+1th
bucket is the `+Inf` overflow bucket, not another explicit bound. This query
uses each explicit upper bound as a weighted estimate and caps overflow at the
largest configured bound. Treat the p50/p95/p99 values as capped estimates:
overflow can make p95/p99 appear lower than the true latency, so configure
bounds that cover the expected latency range.

```sql
WITH histogram_points AS (
    SELECT
        MetricName,
        Attributes['endpoint'] AS endpoint,
        Attributes['tool_name'] AS tool_name,
        Attributes['hevy.feature'] AS feature,
        Attributes['transport'] AS transport,
        Attributes['client_name'] AS client_name,
        toStartOfInterval(TimeUnix, INTERVAL 5 MINUTE) AS window,
        ExplicitBounds,
        BucketCounts
    FROM otel.otel_metrics_histogram
    WHERE MetricName IN ('mcp.tool.duration_ms', 'hevy.api.duration_ms')
      AND ResourceAttributes['service.name'] = 'hevy-mcp'
      AND ResourceAttributes['service.version'] = {release:String}
), expanded AS (
    SELECT
        MetricName,
        endpoint,
        tool_name,
        feature,
        transport,
        client_name,
        window,
        if(
            bucket_index <= length(ExplicitBounds),
            arrayElement(ExplicitBounds, bucket_index),
            arrayElement(ExplicitBounds, -1)
        ) AS upper_bound_ms_capped,
        arrayElement(BucketCounts, bucket_index) AS bucket_count
    FROM histogram_points
    ARRAY JOIN arrayEnumerate(BucketCounts) AS bucket_index
)
SELECT
    window,
    MetricName,
    endpoint,
    tool_name,
    feature,
    transport,
    client_name,
    quantilesWeighted(0.50, 0.95, 0.99)(upper_bound_ms_capped, bucket_count) AS latency_ms_capped_at_bound
FROM expanded
GROUP BY window, MetricName, endpoint, tool_name, feature, transport, client_name
ORDER BY window, MetricName, endpoint, tool_name;
```

## Freshness smoke query

```sql
SELECT
    max(TimeUnix) AS newest_metric_time,
    dateDiff('minute', max(TimeUnix), now()) AS age_minutes
FROM otel.otel_metrics_sum
WHERE ResourceAttributes['service.name'] = 'hevy-mcp'
  AND ResourceAttributes['service.version'] = {release:String};
```

## Privacy and exemplars

Do not add session IDs, API keys, user identifiers, request arguments, response
values, cache keys, or literal Hevy IDs to metric attributes. The process-only
`service.instance.id` is a resource attribute, not an instrument label.

The installed `@opentelemetry/sdk-metrics@2.10.0` path was checked before adding
these views: its public `HistogramMetricData` type and `HistogramAggregator`
do not expose exemplar fields, and its public `ViewOptions` has no exemplar
filter/reservoir configuration. The current repository therefore cannot
produce OTLP metric exemplars through a supported public API. The latency
queries above remain trace-independent; upgrading the metrics SDK should be a
separate follow-up when public trace-exemplar configuration is available.
