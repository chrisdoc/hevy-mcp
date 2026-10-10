# Deployment modes

All three adapters register the same [MCP tools](../README.md#tools) from
[Core](../packages/core/src/tools/register.ts). Choose by client transport and
authentication requirements; client configuration examples live in the
[root README](../README.md).

| Aspect                 | Hosted Cloudflare Worker                           | Local Node stdio                      | Local Node HTTP                                                        |
| ---------------------- | -------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| Connect                | `https://mcp.hevy-mcp.dev/mcp`                     | MCP client spawns `npx -y hevy-mcp`   | `npx hevy-mcp --transport http --host 127.0.0.1 --port 3000`           |
| Transport              | Stateless Streamable HTTP, `POST /mcp`             | stdin/stdout JSON-RPC                 | Stateful Streamable HTTP, `/mcp`                                       |
| Hevy credentials       | Per-request Hevy-key bearer header, or OAuth grant | `HEVY_API_KEY` in process environment | `HEVY_API_KEY` in server environment                                   |
| Endpoint protection    | Direct Hevy-key bearer or OAuth access token       | Child-process access                  | Separate `HEVY_MCP_HTTP_BEARER_TOKEN`; required for non-loopback binds |
| OAuth                  | Optional `OAUTH_KV` binding                        | No                                    | No                                                                     |
| Exercise catalog cache | Fresh per request                                  | Per MCP server/process                | Per MCP server/session, not shared across sessions                     |
| Health probe           | `GET /health`                                      | None                                  | `GET /health`                                                          |
| Best for               | Remote clients, no local server                    | Desktop clients and local agents      | HTTP clients, Docker, local testing                                    |

## Hosted Cloudflare Worker mode

The Worker creates a fresh MCP server, transport, Hevy client, and exercise
catalog cache for each request. It does not maintain MCP sessions or expose
legacy SSE or a `GET /mcp` event stream. Node HTTP also uses Streamable HTTP,
not the legacy SSE transport.

### Direct bearer authentication

Send `Authorization: Bearer <HEVY_API_KEY>` on each MCP request. The Worker
forwards the key upstream only as Hevy's `api-key` header; this direct path does
not persist the raw key. Successful validation is cached for 15 minutes under
a SHA-256-derived key, using OAuth KV when available or a bounded isolate-local
memory cache otherwise. Therefore authentication does not necessarily call
Hevy on every request. See [validation-cache.ts](../packages/worker/src/validation-cache.ts).

For client JSON and Codex commands, see
[hosted configuration](../README.md#connect-to-the-hosted-endpoint).

### OAuth

With a valid `OAUTH_KV` binding, the Worker also exposes discovery metadata,
`/register`, `/authorize`, and `/token`. The authorization form validates a
Hevy key and stores it encrypted in the OAuth grant. This is distinct from the
non-persisting direct bearer path. Access tokens last seven days; refresh tokens
last 30 days. PKCE uses S256.

OAuth is useful for any remote MCP client that cannot attach a fixed header,
not only browser clients. Direct Hevy-key bearer requests remain supported.
Revoking or rotating a Hevy key prevents subsequent upstream access with it;
it does not itself delete stored OAuth grants or immediately clear cached
validation verdicts.

See [worker-oauth.ts](../packages/worker/src/worker-oauth.ts) and the
[OAuth setup guide](../CONTRIBUTING.md#optional-oauth-layer-for-remote-mcp-clients).

### Origins and self-hosting

Origin checks accept requests without `Origin`, same-origin requests, and
exact allowlist matches. `MCP_ALLOWED_ORIGINS` replaces the default list.
OAuth-enabled `POST /authorize` also accepts `Origin: null` for the browser
form flow; this exception never applies to `/mcp`. Do not disable Origin checks
in production.

[CONTRIBUTING.md](../CONTRIBUTING.md#cloudflare-worker-development) owns build,
deployment, OAuth namespace, and origin setup. Self-hosters should set
`CLOUDFLARE_OAUTH_RESOURCE` to their own canonical URL including `/mcp`.
Deployment requires authenticated Cloudflare access and is a live operation;
a clean clone alone is not enough.

## Local Node stdio mode (default)

Your MCP client spawns the executable and supplies `HEVY_API_KEY` through its
child-process environment. Node.js 20 or newer is required by the published
package. Docker uses the same transport by default and requires `-i` to keep
stdin open; it does not require a published HTTP port in stdio mode.

See [local client configuration](../README.md#run-locally-instead) for client-specific
examples. Stdout is reserved for MCP JSON-RPC; `HEVY_MCP_DEBUG=1` enables
privacy-bounded diagnostics on stderr.

## Local Node HTTP mode

```bash
HEVY_API_KEY=your-hevy-api-key npx hevy-mcp --transport http --host 127.0.0.1 --port 3000
```

Connect to `http://127.0.0.1:3000/mcp`. Each initialized session owns its own
MCP server and catalog cache; concurrent sessions do not share that cache.

The Hevy key belongs to the server process. A client bearer header, when
configured, must carry the separate `HEVY_MCP_HTTP_BEARER_TOKEN`, **not** the
Hevy key. Non-loopback binds require and enforce this token; loopback binds
do not enforce bearer authentication. Specific bind hosts validate the Host header
and port; wildcard binds rely on the separate bearer token and accept any
hostname.

For Docker HTTP mode, publish the port deliberately:

```bash
docker run --rm -p 3000:3000 -e HEVY_API_KEY -e HEVY_MCP_HTTP_BEARER_TOKEN \
  ghcr.io/chrisdoc/hevy-mcp:latest --transport http --host 0.0.0.0 --port 3000
```

See [advanced configuration](../README.md#advanced-configuration) for session
limits, idle eviction, body deadlines, and cache controls, and
[streamable-http.ts](../packages/node/src/utils/streamable-http.ts) for lifecycle
and transport behavior.

## Health and telemetry

Worker and Node HTTP expose an unauthenticated `GET /health` returning
`{"status":"ok"}`. Node HTTP returns `503` during shutdown. These are liveness
probes, not checks of Hevy availability or account validity. Stdio has no HTTP
probe.

The Node executable enables project telemetry by default. Set exactly
`HEVY_MCP_TELEMETRY=0` before launch to disable it; package imports alone do not
initialize telemetry. The Worker has its own observability and optional
collector-backed feedback recorder, not Node telemetry. Its feedback recorder
requires `OTEL_COLLECTOR_TOKEN` and can be disabled with
`HEVY_MCP_TELEMETRY=0`; without a token it reports `telemetry_unavailable`.
See [observability](./observability.md) for telemetry ownership and privacy.
