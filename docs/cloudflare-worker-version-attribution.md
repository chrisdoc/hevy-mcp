# Cloudflare Worker version attribution

Cloudflare's native Worker spans expose the deployed Worker tag as
`faas.version` and retain the immutable deployment identifier in
`cloudflare.script_version.id`. Production uploads use the private
`@hevy-mcp/worker` package version as the Worker tag. Pull request uploads use a
bounded prerelease tag in the form `<worker-version>-pr.<number>.<short-sha>`.
The inert bootstrap and cleanup versions intentionally remain untagged.

The Cloudflare `cf` CLI supports `--tag` for both `cf deploy` and
`cf workers versions create`.
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

## Verification through the collector

Use the collector and its configured receiving backend to inspect fresh OTLP
spans; no particular storage backend or SQL table layout is required. The
collector's downstream destinations are infrastructure-owned.

After a tagged Worker deployment and validated collector update:

- Worker spans matching the transform's Cloudflare/service-name predicates
  should retain `faas.version`, gain the same `service.version`, and use
  `service.name=hevy-worker`. The immutable
  `cloudflare.script_version.id` should remain available.
- Historical Worker spans without a semantic tag may have no release version;
  use `service.version`, then `faas.version`, then `unknown` when grouping them.
- Node spans must retain their own `service.name` and `service.version`.
- Preserve trace IDs, span IDs, parent IDs, and span events. Inspect a connected
  trace in the receiving backend rather than inferring correlation from names.
- Domain-level Cloudflare edge spans may not have a Worker version tag and
  should not be required to acquire one or be relabeled as Worker spans.

See [Observability through the OpenTelemetry Collector](./observability.md)
for domain tracing, targeted sampling, context propagation, and OTLP export.
