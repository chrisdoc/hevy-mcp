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

Both commands load `.env` and require `HEVY_API_KEY`. The Node entry point
uses stdio by default: it writes MCP JSON-RPC to stdout and diagnostics to
stderr. It also supports local Streamable HTTP when invoked with
`--transport http`, `--host`, and `--port`; HTTP clients connect to `/mcp`.
Use an MCP client or the inspector rather than typing protocol requests directly
into the terminal.

Useful inspection commands are:

```bash
npm run inspect
npx @modelcontextprotocol/inspector@latest npx hevy-mcp@latest
```

The inspector can require an environment with an MCP-capable browser/client and
may time out in restricted environments.

## Test lanes

Stable lane names and their detailed ownership live in
[docs/test-lanes.md](./docs/test-lanes.md). Use the listed npm aliases or Nx
targets instead of copying raw Vitest selectors into automation.

| Command                         | Purpose                                                                                                                    | Credentials/network                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run test:unit`             | Unit and component tests, excluding integration and performance discovery.                                                 | Deterministic; no live credentials or network.                                                       |
| `npm run test:mcp`              | Nock-backed in-memory MCP integration tests under `tests/integration/mocked`.                                              | Deterministic; fake key and blocked outbound network.                                                |
| `npm run test:contract`         | Tool registration, output-schema, and server-manifest contract baseline.                                                   | Deterministic.                                                                                       |
| `npm run test:stdio`            | Stdio instrumentation and graceful-shutdown/process regression baseline.                                                   | Deterministic.                                                                                       |
| `npm run test:pack`             | Build the shared package candidates once, then inspect, install, and spawn the same Node tarball.                          | Deterministic.                                                                                       |
| `npm run test:live`             | Read-only source canary against the real Hevy API.                                                                         | Requires `HEVY_API_KEY`; preflight fails before Vitest starts when absent.                           |
| `npm run test:worker-http:live` | Local Wrangler Worker canary with comprehensive bounded representative reads against the real Hevy API.                    | Requires `HEVY_RUN_LIVE_WORKER_TESTS=1` and `HEVY_API_KEY`; trusted CI only.                         |
| `npm run test:nightly`          | Published/source launcher canary used by nightly and release workflows.                                                    | Requires `HEVY_API_KEY` and launcher variables; preflight fails when absent.                         |
| `npm run test:performance`      | Reuse the shared Node build and spawn `dist/cli.mjs` for mocked correctness and latency/memory trend scenarios.            | Deterministic; fake key, child-local Nock, and blocked child network.                                |
| `npm run test:pr`               | Run the deterministic unit, mocked MCP, contract, stdio, worker, worker-http, and package lanes expected on pull requests. | Deterministic; does not include the separate performance lane.                                       |
| `npm test`                      | Build, then run full Vitest discovery with optional `.env` loading.                                                        | Broad local command; use the named lanes when you need explicit deterministic or live test behavior. |

Produce the two coverage reports without a wrapper alias:

```bash
npm run test:unit -- --coverage --coverage.reportsDirectory=coverage/unit
npm run test:mcp -- --coverage --coverage.reportsDirectory=coverage/mocked
```

The lane and aggregate registry below is generated from
[`repository/validation-lanes.json`](./repository/validation-lanes.json). The
renderer derives public aliases and Nx targets from the model; it does not
encode dispatcher commands in the model. Run the renderer without arguments to
fail closed on documentation drift, or pass `--write` after an intentional
model change.

<!-- repository-control-plane:validation-lanes:start -->

| Lane ID                    | Command / integration                                                | Gate          | Runtime ownership | Credentials                                        | Artifacts                                                         | Purpose                                                                                                                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------- | ------------- | ----------------- | -------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit`                     | npm run test:unit (Nx: repository:test:unit)                         | blocking      | node-24, node-26  | —                                                  | unit-coverage, unit-junit                                         | vitest; exclude: tests/integration/**, tests/performance/**                                                                                                                                                                                                            |
| `release-unit`             | npm run test:release-unit (Nx: repository:test:release-unit)         | blocking      | node-24, node-26  | —                                                  | —                                                                 | vitest; exclude: tests/integration/**                                                                                                                                                                                                                                  |
| `mocked-mcp`               | npm run test:mcp (Nx: repository:test:mcp)                           | blocking      | node-24, node-26  | —                                                  | mocked-coverage                                                   | vitest; include: tests/integration/mocked/**                                                                                                                                                                                                                           |
| `contract`                 | npm run test:contract (Nx: repository:test:contract)                 | blocking      | node-24           | —                                                  | —                                                                 | vitest; include: packages/node/src/index.test.ts, packages/node/src/utils/config.test.ts, packages/core/src/tools/register.test.ts, packages/core/src/utils/output-schemas.test.ts, tests/unit/server-manifest.test.ts, tests/contract/runtime-contract-matrix.test.ts |
| `stdio`                    | npm run test:stdio (Nx: repository:test:stdio)                       | blocking      | node-24           | —                                                  | stdio-diagnostics                                                 | vitest; include: packages/node/src/index.test.ts, packages/node/src/runtime.test.ts, packages/node/src/utils/stdio-observability.test.ts, packages/node/src/utils/graceful-shutdown.test.ts, packages/node/src/utils/graceful-shutdown.child-process.test.ts           |
| `worker`                   | npm run test:worker (Nx: repository:test:worker)                     | blocking      | workerd           | —                                                  | —                                                                 | vitest-worker-config; config: vitest.workers.config.ts                                                                                                                                                                                                                 |
| `worker-http`              | npm run test:worker-http (Nx: repository:test:worker-http)           | blocking      | workerd           | —                                                  | worker-bundle                                                     | vitest; include: tests/integration/worker-http.integration.test.ts                                                                                                                                                                                                     |
| `pack`                     | npm run test:pack (Nx: repository:test:pack)                         | blocking      | node-24           | —                                                  | node-package-tarball                                              | npm-pack-smoke                                                                                                                                                                                                                                                         |
| `cli`                      | npm run test:cli (Nx: repository:test:cli)                           | blocking      | node-24           | —                                                  | cli-dist                                                          | workspace-test; workspace: @chrisdoc/hevy-cli                                                                                                                                                                                                                          |
| `pack-cli`                 | npm run test:pack:cli (Nx: repository:test:pack:cli)                 | blocking      | node-24           | —                                                  | cli-package-tarball                                               | npm-pack-smoke; workspace: @chrisdoc/hevy-cli                                                                                                                                                                                                                          |
| `performance`              | npm run test:performance (Nx: repository:test:performance)           | informational | node-24           | —                                                  | performance-summary                                               | vitest; include: tests/performance/performance.test.ts                                                                                                                                                                                                                 |
| `repository-control-plane` | npm run check:control-plane (Nx: repository:check:control-plane)     | blocking      | node-24, node-26  | —                                                  | —                                                                 | control-plane; check: control-plane                                                                                                                                                                                                                                    |
| `package-boundaries`       | npm run check:boundaries (Nx: repository:check:boundaries)           | blocking      | node-24, node-26  | —                                                  | core-source, hevy-client-source, operations-source, worker-bundle | control-plane; check: boundaries                                                                                                                                                                                                                                       |
| `package-exports`          | npx nx run repository:check:exports                                  | blocking      | node-24, node-26  | —                                                  | —                                                                 | control-plane; check: exports                                                                                                                                                                                                                                          |
| `package-publint`          | npx nx run repository:check:publint                                  | blocking      | node-24           | —                                                  | —                                                                 | control-plane; check: publint                                                                                                                                                                                                                                          |
| `package-changesets`       | npx nx run repository:check:package-changesets                       | blocking      | node-24           | —                                                  | —                                                                 | control-plane; check: changesets                                                                                                                                                                                                                                       |
| `changeset-status`         | npm run check:changeset (Nx: repository:check:changeset)             | blocking      | node-24           | —                                                  | —                                                                 | changeset-status                                                                                                                                                                                                                                                       |
| `types`                    | npm run check:types (Nx: repository:check:types)                     | blocking      | node-24, node-26  | —                                                  | core-source, hevy-client-source, operations-source                | typescript; project: tsconfig.json                                                                                                                                                                                                                                     |
| `check`                    | npx nx run repository:check                                          | blocking      | node-24, node-26  | —                                                  | —                                                                 | repository-check                                                                                                                                                                                                                                                       |
| `build`                    | npm run build (Nx: repository:build)                                 | blocking      | node-24, node-26  | —                                                  | node-dist                                                         | package-build; workspace: hevy-mcp                                                                                                                                                                                                                                     |
| `worker-bundle`            | npm run worker:dry-run (Nx: repository:worker:dry-run)               | blocking      | workerd           | —                                                  | worker-bundle                                                     | wrangler-dry-run                                                                                                                                                                                                                                                       |
| `server-manifest`          | npm run check:server-manifest (Nx: repository:check:server-manifest) | blocking      | node-24, node-26  | —                                                  | server-manifest                                                   | manifest-drift                                                                                                                                                                                                                                                         |
| `docker`                   | external: docker workflow                                            | blocking      | node-24           | —                                                  | docker-image                                                      | docker-smoke                                                                                                                                                                                                                                                           |
| `generation`               | npm run check:generated (Nx: repository:check:generated)             | blocking      | node-24, node-26  | —                                                  | generated-client                                                  | generated-output-closure                                                                                                                                                                                                                                               |
| `integration-live`         | npm run test:live (Nx: repository:test:live)                         | release       | node-24           | HEVY_API_KEY                                       | live-diagnostics                                                  | vitest-live                                                                                                                                                                                                                                                            |
| `worker-http-live`         | npm run test:worker-http:live (Nx: repository:test:worker-http:live) | release       | workerd           | HEVY_API_KEY, HEVY_RUN_LIVE_WORKER_TESTS           | live-worker-diagnostics                                           | worker-live                                                                                                                                                                                                                                                            |
| `release-integration`      | npm run test:integration (Nx: repository:test:integration)           | release       | node-24           | HEVY_API_KEY                                       | live-diagnostics                                                  | vitest-integration; include: tests/integration/**                                                                                                                                                                                                                      |
| `nightly`                  | npm run test:nightly (Nx: repository:test:nightly)                   | nightly       | node-24           | HEVY_API_KEY, HEVY_MCP_COMMAND, HEVY_MCP_ARGS_JSON | nightly-diagnostics                                               | launcher-canary                                                                                                                                                                                                                                                        |
| `diagnostics`              | npx nx run repository:test:diagnostics                               | blocking      | node-24           | —                                                  | —                                                                 | node-test; include: tests/nightly/diagnostics.test.mjs                                                                                                                                                                                                                 |

<!-- repository-control-plane:validation-aggregates:start -->

| Aggregate ID      | Nx target / command                    | Members                                                                                                                                                                                                                                                                                                  | Count | Mapping  |
| ----------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- |
| `pull-request`    | npx nx run repository:test:pr          | `unit`, `mocked-mcp`, `contract`, `stdio`, `worker`, `worker-http`, `pack`, `cli`, `pack-cli`, `package-publint`                                                                                                                                                                                         | 10    | mapped   |
| `pull-request-ci` | external: github-actions               | `repository-control-plane`, `package-boundaries`, `package-exports`, `package-publint`, `types`, `server-manifest`, `check`, `package-changesets`, `diagnostics`, `build`, `worker-http`, `worker`, `mocked-mcp`, `unit`, `contract`, `stdio`, `pack`, `cli`, `pack-cli`, `worker-bundle`, `performance` | 21    | external |
| `release`         | npx nx run repository:release:validate | `build`, `server-manifest`, `release-unit`, `worker`, `pack`, `cli`, `pack-cli`, `package-publint`, `release-integration`, `nightly`, `worker-http-live`                                                                                                                                                 | 11    | mapped   |
| `pre-push`        | npx nx run repository:pre-push         | `types`, `changeset-status`, `pull-request`                                                                                                                                                                                                                                                              | 3     | mapped   |

<!-- repository-control-plane:validation-aggregates:end -->

<!-- repository-control-plane:validation-lanes:end -->

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

Also verify the generated contributor projection when changing validation lane
identities, aliases, or aggregate membership:

```bash
node scripts/render-validation-lanes.mjs
```

Also run the narrow checks related to your change. In particular:

- Run `npm run test:stdio` after changes to process lifecycle, stdio transport,
  diagnostics, or the MCP TypeScript SDK.
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

Known upstream schema corrections belong in `scripts/openapi-spec.js`, so a
future refresh reapplies them before the spec is written. Run
`npm run check:openapi` to verify the repository-owned compatibility invariants
before committing a refreshed spec.

The Node package, Worker, and CLI ship bundled compositions of the shared core
and Hevy client. Changesets for shared runtime packages must therefore include
every affected shipped consumer. The package-changeset check enforces the
release matrix documented below.

## Runtime architecture boundaries

`packages/core` constructs the tools, prompts, resources, and MCP runtime used by
both runtimes. `packages/hevy-client` owns the native-fetch Hevy client:

- `packages/node` is Node-only. Keep process lifecycle, Node built-ins, stdio
  transport, telemetry, and stdio observability there.
- `packages/worker` is the Cloudflare Worker Streamable HTTP and OAuth entry
  point. It must not import Node-only code.
- `packages/cli` is the public Node.js command-line client. It bundles the
  runtime-neutral client and core but does not depend on either runtime adapter.
- `packages/core` and `packages/hevy-client` must remain safe in both Node.js
  and Cloudflare Workers.
- The shipped composition graph is `hevy-client → core → node/worker/CLI`;
  adapters may depend directly on either runtime-neutral package but must not
  import one another.

`packages/node/src/utils/stdio-observability.ts` instruments private MCP SDK
stdio fields such as `_ondata` and `_readBuffer`. After every
`MCP TypeScript SDK` upgrade,
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
npx nx run repository:worker:deploy
```

`worker:deploy` requires an authenticated Wrangler/Cloudflare environment and
is a production-affecting operation. Prefer `worker:dry-run` for local bundle
verification unless deployment is explicitly intended.

`cloudflare.config.ts` is the Worker configuration used by Wrangler's
experimental TypeScript config mode. Commands must include `--x-new-config`;
the mode is selected inside the config using `WRANGLER_MODE` and the GitHub
Environment values. A clean clone without those values defaults to a
`workers.dev` development Worker.

This Wrangler configuration format is experimental. The repository pins a
Wrangler version that includes the feature, but the `--x-new-config` flag and
`wrangler/experimental-config` API may change in future releases.

The GitHub `production` and `preview` Environments provide the account-owned
deployment settings; they are not committed to this repository. Configure
these values in each GitHub Environment:

- Variable `CLOUDFLARE_WORKER_NAME`: the Worker name. Use a preview Worker name
  that matches the preview URL prefix expected by the workflow.
- Secret `CLOUDFLARE_OAUTH_KV_NAMESPACE_ID`: the KV namespace ID bound as
  `OAUTH_KV`.
- Production-only variable `CLOUDFLARE_WORKER_ROUTE`: the custom-domain
  hostname or route pattern. Preview deployments intentionally leave routes
  unset because they use PR version aliases.
- Optional variable `CLOUDFLARE_OTEL_LOGS_DESTINATIONS`: comma-separated
  Cloudflare Workers Observability log destination names.
- Optional variable `CLOUDFLARE_OTEL_TRACES_DESTINATIONS`: comma-separated
  Cloudflare Workers Observability trace destination names.

The workflows pass these values to `cloudflare.config.ts`. Namespace IDs and
routes therefore do not need to be hardcoded in a committed Wrangler config.

`worker:deploy` runs `wrangler deploy --x-new-config --env production`, so it
intentionally targets a production environment named `production`. In CI, the
TypeScript config supplies that environment's Worker name, route, and KV binding.
`worker:dev` and `worker:dry-run` use the same portable TypeScript
configuration with development defaults.

Self-hosters can add account-owned settings to their own environment block or
fork configuration:

- To enable OAuth, create a KV namespace and bind its ID with the binding name
  `OAUTH_KV`.
- Add `routes` or a custom domain only if the hostname belongs to your account;
  the portable default uses `workers.dev` instead.
- Add observability destination names through the optional
  `CLOUDFLARE_OTEL_LOGS_DESTINATIONS` and
  `CLOUDFLARE_OTEL_TRACES_DESTINATIONS` variables only if they exist in your
  account. For the maintainer environment, set these to `otel-logs` and
  `otel`; self-hosters can omit or replace them.

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

Local development can disable Origin validation for browser tools such as MCP
Inspector by copying `.dev.vars.example` to `.dev.vars`. The dedicated PR
preview Worker also sets `MCP_DISABLE_ORIGIN_CHECK=true` because preview URLs
are dynamic. Do not set this variable on production Workers; it disables the
Origin allowlist while still reflecting CORS headers for the requesting origin.

Wildcards are unsupported. Browser requests with an unmatched `Origin` receive
`403`; non-browser requests without `Origin` remain accepted. Test both origin
and bearer-auth behavior when changing Worker request handling.

### Optional OAuth layer for remote MCP clients

Clients that cannot send a fixed `Authorization` header (for example Claude.ai
custom connectors) can use OAuth 2.1 instead. The layer is opt-in per
deployment: create a KV namespace and bind it as `OAUTH_KV` in the relevant
Wrangler environment. For example, a fork can provide the namespace ID through
`CLOUDFLARE_OAUTH_KV_NAMESPACE_ID`:

```bash
npx wrangler kv namespace create OAUTH_KV
```

```jsonc
CLOUDFLARE_OAUTH_KV_NAMESPACE_ID=<namespace-id>
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
trusted release workflow: the Changesets workflow deploys only after it has
published a release. A successful `main` build or a Version Packages PR
creation does not deploy the production Worker.

PR previews use a dedicated non-production OAuth KV namespace, so preview
grants never share production OAuth state.

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

The root is a private repository orchestrator; runtime/package code and manifests
are under `packages/*`. Changeset eligibility is determined by the changed content,
not its Conventional Commit type. Files under `packages/*`, runtime-visible behavior
changes, workspace package dependency changes, and explicit release triggers such as
`cloudflare.config.ts` **must** use a non-empty bump Changeset naming every affected
package:

```bash
npx changeset
```

Choose `patch`, `minor`, or `major` based on the release impact. An empty
Changeset is allowed only when the entire PR is no-release/internal-only and
changes no workspace package or explicit release trigger; it cannot accompany a
release-triggering change. Docs, CI, repository-only tests/tooling, and chores may
qualify only when they meet those conditions:

```bash
npx changeset --empty
```

Runtime changes in the private workspaces should use a patch changeset for the
affected package: `@hevy-mcp/hevy-client`, `@hevy-mcp/core`, or
`@hevy-mcp/worker`. These packages are versioned for internal release and
deployment tracking, but remain private and are never published to npm:

```md
---
"@hevy-mcp/core": patch
---

Describe the internal runtime change here.
```

Every package listed below must receive at least a patch bump. Larger bumps are
allowed when warranted by that package's own impact:

| Changed composition     | Required Changeset packages                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `@hevy-mcp/hevy-client` | `@hevy-mcp/hevy-client`, `@hevy-mcp/core`, `hevy-mcp`, `@hevy-mcp/worker`, and `@chrisdoc/hevy-cli` |
| `@hevy-mcp/core`        | `@hevy-mcp/core`, `hevy-mcp`, `@hevy-mcp/worker`, and `@chrisdoc/hevy-cli`                          |
| Node adapter only       | `hevy-mcp` only                                                                                     |
| Worker only             | `@hevy-mcp/worker` only                                                                             |
| CLI only                | `@chrisdoc/hevy-cli` only                                                                           |

Do not couple unrelated package versions. Core, the Hevy client, and Worker
remain private. Changesets version them for internal release/deployment
identity but do not create npm tags for them because
`privatePackages.tag=false`. The public Node and CLI packages publish normally.

`cloudflare.config.ts` is production Worker configuration, so changing it also
requires a Worker changeset even though it is outside `packages/worker`.
Production Worker deployment occurs only when a Changesets version commit
changes `packages/worker/package.json`. Public Node- or CLI-only releases do not
deploy the Worker; Worker-only private releases still do.

Validate the branch against `origin/main`:

```bash
npm run check:changeset
```

CI also checks that every changed workspace directory has a changeset naming
that same package, then applies the transitive composition matrix. For example,
changes under `packages/cli` require only `@chrisdoc/hevy-cli`, while changes
under `packages/core` additionally require every shipped core consumer.

The automated `changeset-release/main` "Version Packages" pull request should
be merged on the routine release cadence (weekly by default), not for every
individual change. Security fixes and high-impact user-facing bugs may use an
urgent release outside that cadence.

## Automated-agent guidance

[AGENTS.md](./AGENTS.md) contains additional repository instructions for
automated coding agents, including tool-specific workflows. Human contributors
should follow this contributor guide and are not required to use agent-only
tools.
