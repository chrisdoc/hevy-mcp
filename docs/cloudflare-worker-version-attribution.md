# Cloudflare Worker version attribution

Cloudflare's native Worker spans expose the deployed Worker tag as
`faas.version` and retain the immutable deployment identifier in
`cloudflare.script_version.id`. Production uploads use the private
`@hevy-mcp/worker` package version as the Worker tag. Pull request uploads use a
bounded prerelease tag in the form `<worker-version>-pr.<number>.<short-sha>`.
The inert bootstrap and cleanup versions intentionally remain untagged.

Wrangler supports version tags for both [`deploy` and `versions upload`](https://developers.cloudflare.com/workers/wrangler/commands/workers/#versions-upload).
No Worker-side OpenTelemetry SDK is required.

The collector changes the telemetry resource name from `hevy-mcp` to
`hevy-worker`. This does not change the Cloudflare Worker script name, route, or
hostname.

## Collector handoff

The live collector configuration is infrastructure-owned and is not duplicated
in this repository. As of this handoff, LXC 124 runs
`otelcol-contrib` 0.156.0 through `otelcol-contrib.service`, using:

- config: `/etc/otelcol-contrib/config.yaml`
- environment: `/etc/otelcol-contrib/otelcol-contrib.conf`
- binary: `/usr/bin/otelcol-contrib`

Merge this processor into that config. In the traces pipeline, add
`transform/cloudflare_worker_resource` immediately after
`filter/hevy_mcp_noise` and before `batch`. The order is required because the
existing noise filter must still see the original `hevy-mcp` service name. Do
not remove or reorder existing processors.

```yaml
processors:
  transform/cloudflare_worker_resource:
    error_mode: ignore
    trace_statements:
      - 'set(resource.attributes["service.version"], resource.attributes["faas.version"]) where resource.attributes["cloud.provider"] == "cloudflare" and resource.attributes["service.name"] == "hevy-mcp" and (resource.attributes["service.version"] == nil or resource.attributes["service.version"] == "") and resource.attributes["faas.version"] != nil and resource.attributes["faas.version"] != ""'
      - 'set(resource.attributes["service.name"], "hevy-worker") where resource.attributes["cloud.provider"] == "cloudflare" and resource.attributes["service.name"] == "hevy-mcp"'

service:
  pipelines:
    traces:
      processors:
        # Preserve every existing entry; this excerpt shows required order.
        - filter/hevy_mcp_noise
        - transform/cloudflare_worker_resource
        - batch
```

The guard is deliberately narrow:

- `cloud.provider` must be exactly `cloudflare`;
- the incoming `service.name` must be exactly `hevy-mcp`;
- `service.version` must be absent or empty;
- `faas.version` must be present and non-empty.

The version statement runs before the rename statement so both can match the
original resource. A synthetic Cloudflare resource with `service.name=hevy-mcp`,
no `service.version`, and `faas.version=0.0.1` becomes
`service.name=hevy-worker`, `service.version=0.0.1`. A Node resource remains
`service.name=hevy-mcp` with its existing semantic version. The statements do
not modify `cloudflare.script_version.id`. The syntax follows the Collector
Contrib [transform processor](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/transformprocessor)
resource-attribute form.

## Safe apply and rollback

Do not restart until the merged configuration validates with the service's
environment loaded. From the Proxmox host, make a timestamped backup in LXC 124,
edit the live config, then validate:

```bash
pct exec 124 -- bash -lc '
  set -euo pipefail
  config=/etc/otelcol-contrib/config.yaml
  backup="${config}.bak.$(date -u +%Y%m%dT%H%M%SZ)"
  cp --preserve=all -- "$config" "$backup"
  printf "backup=%s\n" "$backup"
'

pct exec 124 -- bash -lc '
  set -euo pipefail
  set -a
  . /etc/otelcol-contrib/otelcol-contrib.conf
  set +a
  exec /usr/bin/otelcol-contrib validate $OTELCOL_OPTIONS
'
```

The environment file is required: running `validate` without it fails because
the current config references exporter environment variables. After validation,
restart separately and verify both service health and fresh telemetry. If the
restart or query verification fails, restore the printed backup path, validate
the restored config with the same command, and restart again:

```bash
pct exec 124 -- systemctl restart otelcol-contrib.service
pct exec 124 -- systemctl --no-pager --full status otelcol-contrib.service

# Rollback example; replace the timestamp with the backup printed above.
pct exec 124 -- cp --preserve=all -- \
  /etc/otelcol-contrib/config.yaml.bak.YYYYMMDDTHHMMSSZ \
  /etc/otelcol-contrib/config.yaml
```

## ClickHouse verification

Historical Cloudflare rows predate semantic deployment tags. Use a fallback
when grouping them:

```sql
SELECT
  coalesce(
    nullIf(ResourceAttributes['service.version'], ''),
    nullIf(ResourceAttributes['faas.version'], ''),
    'unknown'
  ) AS effective_service_version,
  count() AS spans
FROM otel.otel_traces
WHERE ServiceName IN ('hevy-mcp', 'hevy-worker')
GROUP BY effective_service_version
ORDER BY spans DESC;
```

After deploying the tagged Worker and restarting the validated collector,
replace the cutoff below with the UTC deployment time. `missing_service_version`
must reach zero for new Cloudflare spans, while the immutable deployment ID
remains available:

```sql
SELECT
  count() AS cloudflare_spans,
  countIf(ResourceAttributes['service.version'] = '') AS missing_service_version,
  countIf(ResourceAttributes['cloudflare.script_version.id'] != '') AS with_deployment_id,
  groupUniqArray(ResourceAttributes['service.version']) AS observed_versions
FROM otel.otel_traces
WHERE Timestamp >= parseDateTime64BestEffort('2026-01-01T00:00:00Z')
  AND ServiceName = 'hevy-worker'
  AND ResourceAttributes['cloud.provider'] = 'cloudflare';
```

Confirm Node resources were not rewritten by grouping non-Cloudflare spans over
the same cutoff:

```sql
SELECT
  ResourceAttributes['service.version'] AS service_version,
  count() AS spans
FROM otel.otel_traces
WHERE Timestamp >= parseDateTime64BestEffort('2026-01-01T00:00:00Z')
  AND ServiceName = 'hevy-mcp'
  AND ResourceAttributes['cloud.provider'] != 'cloudflare'
GROUP BY service_version
ORDER BY spans DESC;
```
