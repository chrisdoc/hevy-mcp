# Contributing to hevy-mcp

This guide covers repository setup, architecture, testing, Cloudflare Worker
development, and pull request expectations. Consumer installation and MCP client
configuration remain in [README.md](./README.md).

## Prerequisites

- Git
- npm
- Node.js

The repository currently has a deliberate Node policy difference:

- `package.json` declares the published package compatible with Node.js 20 or
  newer.
- Repository development guidance uses the exact version in `.nvmrc`, which is
  Node.js 24 at the current base.
- CI tests Node.js 24 and 26 at the current base, as configured in
  `.github/workflows/build-and-test.yml`.

Use `.nvmrc` for development unless a change is specifically testing the wider
published compatibility range:

```bash
nvm use
node --version
npm install
```

Do not silently change the published Node policy as part of unrelated work.

## Hevy API key and local environment

Copy the sample environment when you need to start the server or run live
tests:

```bash
cp .env.sample .env
```

Set your key only in `.env` or the process environment:

```dotenv
HEVY_API_KEY=your-hevy-api-key
```

- Never commit `.env` or a real API key.
- Never pass the key through CLI arguments, URLs, logs, fixtures, or screenshots.
- Deterministic unit, mocked MCP, contract, stdio, package, and performance
  lanes do not need a live key.
- `npm run test:live` requires `HEVY_API_KEY` and fails its preflight when the
  key is absent.

## Local development

Install, build, and start the production stdio executable:

```bash
npm install
npm run build
npm start
```

For watch mode:

```bash
npm run dev
```

Both commands load `.env` and require `HEVY_API_KEY`. The Node entry point is
stdio-only. It writes MCP JSON-RPC to stdout and diagnostics to stderr; it does
not listen on a port or support `PORT`, `HEVY_MCP_TRANSPORT`, or `--transport`.
Use an MCP client or the inspector rather than typing requests directly into
the terminal.

Useful inspection commands are:

```bash
npm run inspect
npm run inspect:npm
```

The inspector can require an environment with an MCP-capable browser/client and
may time out in restricted environments.

## Test lanes

Stable lane names and their detailed ownership live in
[docs/test-lanes.md](./docs/test-lanes.md). Use these scripts instead of copying
raw Vitest selectors into automation.

| Command                         | Purpose                                                                                                 | Credentials/network                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run test:unit`             | Unit and component tests, excluding integration and performance discovery.                              | Deterministic; no live credentials or network.                                                       |
| `npm run test:mcp`              | Nock-backed in-memory MCP integration tests under `tests/integration/mocked`.                           | Deterministic; fake key and blocked outbound network.                                                |
| `npm run test:contract`         | Tool registration, output-schema, and server-manifest contract baseline.                                | Deterministic.                                                                                       |
| `npm run test:stdio`            | Stdio instrumentation and graceful-shutdown/process regression baseline.                                | Deterministic.                                                                                       |
| `npm run test:pack`             | Build and inspect the `npm pack --dry-run` inventory, binary mapping, and package files.                | Deterministic.                                                                                       |
| `npm run test:live`             | Read-only source canary against the real Hevy API.                                                      | Requires `HEVY_API_KEY`; preflight fails before Vitest starts when absent.                           |
| `npm run test:worker-http:live` | Local Wrangler Worker canary with comprehensive bounded representative reads against the real Hevy API. | Requires `HEVY_RUN_LIVE_WORKER_TESTS=1` and `HEVY_API_KEY`; trusted CI only.                         |
| `npm run test:nightly`          | Published/source launcher canary used by nightly and release workflows.                                 | Requires `HEVY_API_KEY` and launcher variables; preflight fails when absent.                         |
| `npm run test:performance`      | Build and spawn `dist/cli.mjs` for mocked correctness and latency/memory trend scenarios.               | Deterministic; fake key, child-local Nock, and blocked child network.                                |
| `npm run test:coverage`         | Produce separate unit and mocked MCP coverage reports.                                                  | Deterministic.                                                                                       |
| `npm run test:pr`               | Run the deterministic unit, mocked MCP, contract, stdio, and package lanes expected on pull requests.   | Deterministic; does not include the separate performance lane.                                       |
| `npm test`                      | Build, then run full Vitest discovery with optional `.env` loading.                                     | Broad local command; use the named lanes when you need explicit deterministic or live test behavior. |

The live integration file under `tests/integration` is credential-gated in its
own implementation, but contributors should use the explicit `test:live` lane
for a real API canary. Do not describe `test:live` as skipped without a key: its
launcher intentionally exits with an error before starting tests.

The live Worker lane invokes only bounded read paths. It verifies
`search-exercise-templates` registration through `tools/list` without invoking
the full-catalog search against production.

The normal pull request baseline is:

```bash
npm run test:pr
npm run test:performance
```

Performance timing targets are currently informational. Correctness, fixture,
network-isolation, and report-shape failures remain blocking. The versioned
report is written to `test-results/performance/summary.json`.

## Required validation

Run these checks before opening a pull request:

```bash
npm run check
npm run check:types
npm run build
npm run test:pr
npm run test:performance
npm run check:changeset
```

Also run the narrow checks related to your change. In particular:

- Run `npm run test:stdio` after changes to process lifecycle, stdio transport,
  diagnostics, or `@modelcontextprotocol/sdk`.
- Run `npm run test:pack` after package entry point, binary, manifest, or
  published-file changes.
- Run `npm run check:server-manifest` after server metadata changes.
- Run `npm run measure:tokens` when tool descriptions or schemas materially
  change; see [docs/token-cost-tracking.md](./docs/token-cost-tracking.md).
- Run `npm run test:live` only when a real Hevy API canary is appropriate and a
  safe credential is available.

`npm run check` runs both oxlint and oxfmt in check mode using the local npm
dependencies. The project uses the Oxc tools for fast, consistent type-aware
linting and formatting. Fix reported code warnings rather than assuming they
are harmless. Use `npm run check:fix` for automated fixes, then inspect the
resulting diff. `check:fix` modifies files in the working tree but does not
stage them; review and stage the changes manually. hk uses the same tools for
Git hook execution.

Git hooks are managed by hk, replacing the former Lefthook setup. The
`hk.pkl` configuration runs formatting and unit tests on pre-commit, commit
message linting on commit-msg, and changeset plus PR validation checks on
pre-push. hk is managed by mise in `mise.toml`; after installing mise, run
`mise install` and `mise exec hk -- hk install --mise` once per clone to enable
the repository's Git hooks without requiring mise activation. CI runs the npm
validation scripts directly.

## Generated API client

The Hevy API client, types, and schemas under
`packages/hevy-client/src/generated/` are generated by Kubb. Never edit files
in that directory manually. Generated API functions and `.kubb`
internals are private; consumers use the curated client package barrels.

To refresh the checked-in OpenAPI specification and generated client:

```bash
npm run openapi
npm run build:client
```

`npm run openapi` fetches the upstream Hevy specification and can fail with
`ENOTFOUND api.hevyapp.com` in sandboxed environments. If
`openapi-spec.json` changes, regenerate the client and review the complete
generated diff. Do not patch generated TypeScript errors by hand.

## Runtime architecture boundaries

`packages/core` constructs the tools, prompts, resources, and MCP runtime used by
both runtimes. `packages/hevy-client` owns the native-fetch Hevy client:

- `packages/node` is Node-only. Keep process lifecycle, Node built-ins, stdio
  transport, telemetry, and stdio observability there.
- `packages/worker` is the Cloudflare Worker Streamable HTTP and OAuth entry
  point. It must not import Node-only code.
- `packages/core` and `packages/hevy-client` must remain safe in both Node.js
  and Cloudflare Workers.
- The allowed dependency graph is `hevy-client → core → node/worker`.

`packages/node/src/utils/stdio-observability.ts` instruments private MCP SDK
stdio fields such as `_ondata` and `_readBuffer`. After every
`@modelcontextprotocol/sdk` upgrade,
run the complete stdio observability suite (`npm run test:stdio`) and inspect
the SDK compatibility assumptions before merging.

## Cloudflare Worker development

The Worker exposes stateless Streamable HTTP at `POST /mcp`. It accepts the
caller's Hevy key per request:

```http
Authorization: Bearer YOUR_HEVY_API_KEY
```

It does not use a shared Worker `HEVY_API_KEY` secret and does not expose a
legacy SSE/GET stream. Each request gets a fresh MCP server, transport, Hevy
client, and exercise-template cache.

Use the repository scripts for local development, bundle validation, and
deployment:

```bash
npm run worker:dev
npm run worker:dry-run
npm run worker:deploy
```

`worker:deploy` requires an authenticated Wrangler/Cloudflare environment and
is a production-affecting operation. Prefer `worker:dry-run` for local bundle
verification unless deployment is explicitly intended.

Browser clients must send an exact origin from the Worker's default allowlist:

```text
https://claude.ai
https://www.claude.ai
https://claude.com
https://www.claude.com
https://chatgpt.com
https://chat.openai.com
https://vscode.dev
https://github.dev
```

Self-hosted deployments can replace this list with the optional
comma-separated Worker variable:

```text
MCP_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
```

Wildcards are unsupported. Browser requests with an unmatched `Origin` receive
`403`; non-browser requests without `Origin` remain accepted. Test both origin
and bearer-auth behavior when changing Worker request handling.

### Optional OAuth layer for remote MCP clients

Clients that cannot send a fixed `Authorization` header (for example Claude.ai
custom connectors) can use OAuth 2.1 instead. The layer is opt-in per
deployment: create a KV namespace and bind it as `OAUTH_KV` in
`wrangler.jsonc`:

```bash
npx wrangler kv namespace create OAUTH_KV
```

```jsonc
"kv_namespaces": [{ "binding": "OAUTH_KV", "id": "<namespace-id>" }]
```

With the binding present, `packages/worker/src/worker-oauth.ts` (backed by
`@cloudflare/workers-oauth-provider`) additionally serves:

- `/.well-known/oauth-authorization-server` and
  `/.well-known/oauth-protected-resource` discovery metadata
- `/register` (RFC 7591 dynamic client registration)
- `/token` (authorization code + PKCE and refresh-token grants)
- `/authorize` (a form that validates the submitted Hevy API key against Hevy
  and stores it encrypted inside the OAuth grant)

Bearer values matching the OAuth access-token shape (`userId:grantId:secret`)
are routed to the OAuth layer; Hevy API keys never contain a colon, so they
keep using the direct path. With OAuth enabled, unauthenticated `POST /mcp`
requests receive the RFC 9728 challenge (`WWW-Authenticate` with
`resource_metadata`) instead of the bare `Bearer` challenge so OAuth clients
can discover the flow. Without the `OAUTH_KV` binding, Worker behavior is
unchanged.

Internal pull requests receive preview Worker deployments through
`.github/workflows/deploy-worker.yml`. Fork pull requests do not receive
deployment credentials. Production deployment remains gated by the repository's
trusted CI/release workflows.

## Git and pull requests

1. Create a feature branch from the current `origin/main`. Never commit or push
   directly to `main`.
2. Keep the change focused and include tests or documentation for behavior
   changes.
3. Use Conventional Commit messages such as `feat:`, `fix:`, `docs:`, `test:`,
   `refactor:`, `build:`, `ci:`, `chore:`, or `style:`.
4. Include a Changesets file in every pull request that changes source,
   dependencies, documentation, CI, tests, or internal behavior.
5. Run the required validation and describe noteworthy limitations in the pull
   request.

Use a version bump changeset only for user-facing runtime behavior:

```bash
npx changeset
```

Choose `patch`, `minor`, or `major` based on the public impact. For docs, CI,
tests, refactors, and other no-release changes, create an empty changeset:

```bash
npx changeset --empty
```

Validate the branch against `origin/main`:

```bash
npm run check:changeset
```

The automated `changeset-release/main` "Version Packages" pull request should
be merged on the routine release cadence (weekly by default), not for every
individual change. Security fixes and high-impact user-facing bugs may use an
urgent release outside that cadence.

## Automated-agent guidance

[AGENTS.md](./AGENTS.md) contains additional repository instructions for
automated coding agents, including tool-specific workflows. Human contributors
should follow this contributor guide and are not required to use agent-only
tools.
