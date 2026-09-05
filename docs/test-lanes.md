# Test lanes and performance baseline

This document owns the stable public commands introduced by testing-strategy
ticket TS-06. Contributors and CI should use these names instead of copying raw
Vitest selectors.

Use the pinned Node.js and pnpm versions through mise. On this linux/arm64
environment, set `MISE_AUTO_INSTALL=false` on every `mise` invocation because
the pinned `kiota` tool has no linux/arm64 build:

```sh
MISE_AUTO_INSTALL=false mise install
MISE_AUTO_INSTALL=false mise exec -- pnpm run test:unit
```

The lane and aggregate registry below mirrors
[`repository/validation-lanes.json`](../repository/validation-lanes.json). The
canonical model is validated by `pnpm run check:control-plane`; use the named
commands below instead of copying raw selectors into automation.

| Lane ID                    | Command / integration                                                 | Gate          | Runtime ownership | Credentials                                        | Artifacts                                                         | Purpose                                                                                                                                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------- | ------------- | ----------------- | -------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit`                     | pnpm run test:unit (Nx: repository:test:unit)                         | blocking      | node-24, node-26  | —                                                  | unit-coverage, unit-junit                                         | vitest; exclude: tests/integration/**, tests/performance/**                                                                                                                                                                                                            |
| `release-unit`             | pnpm run test:release-unit (Nx: repository:test:release-unit)         | blocking      | node-24, node-26  | —                                                  | —                                                                 | vitest; exclude: tests/integration/**                                                                                                                                                                                                                                  |
| `mocked-mcp`               | pnpm run test:mcp (Nx: repository:test:mcp)                           | blocking      | node-24, node-26  | —                                                  | mocked-coverage                                                   | vitest; include: tests/integration/mocked/**                                                                                                                                                                                                                           |
| `contract`                 | pnpm run test:contract (Nx: repository:test:contract)                 | blocking      | node-24           | —                                                  | —                                                                 | vitest; include: packages/node/src/index.test.ts, packages/node/src/utils/config.test.ts, packages/core/src/tools/register.test.ts, packages/core/src/utils/output-schemas.test.ts, tests/unit/server-manifest.test.ts, tests/contract/runtime-contract-matrix.test.ts |
| `stdio`                    | pnpm run test:stdio (Nx: repository:test:stdio)                       | blocking      | node-24           | —                                                  | stdio-diagnostics                                                 | vitest; include: packages/node/src/index.test.ts, packages/node/src/runtime.test.ts, packages/node/src/utils/stdio-observability.test.ts, packages/node/src/utils/graceful-shutdown.test.ts, packages/node/src/utils/graceful-shutdown.child-process.test.ts           |
| `worker`                   | pnpm run test:worker (Nx: repository:test:worker)                     | blocking      | workerd           | —                                                  | —                                                                 | vitest-worker-config; config: vitest.workers.config.ts                                                                                                                                                                                                                 |
| `worker-http`              | pnpm run test:worker-http (Nx: repository:test:worker-http)           | blocking      | workerd           | —                                                  | worker-bundle                                                     | vitest; include: tests/integration/worker-http.integration.test.ts                                                                                                                                                                                                     |
| `pack`                     | pnpm run test:pack (Nx: repository:test:pack)                         | blocking      | node-24           | —                                                  | node-package-tarball                                              | npm-pack-smoke                                                                                                                                                                                                                                                         |
| `cli`                      | pnpm run test:cli (Nx: repository:test:cli)                           | blocking      | node-24           | —                                                  | cli-dist                                                          | workspace-test; workspace: @chrisdoc/hevy-cli                                                                                                                                                                                                                          |
| `pack-cli`                 | pnpm run test:pack:cli (Nx: repository:test:pack:cli)                 | blocking      | node-24           | —                                                  | cli-package-tarball                                               | npm-pack-smoke; workspace: @chrisdoc/hevy-cli                                                                                                                                                                                                                          |
| `performance`              | pnpm run test:performance (Nx: repository:test:performance)           | informational | node-24           | —                                                  | performance-summary                                               | vitest; include: tests/performance/performance.test.ts                                                                                                                                                                                                                 |
| `repository-control-plane` | pnpm run check:control-plane (Nx: repository:check:control-plane)     | blocking      | node-24, node-26  | —                                                  | —                                                                 | control-plane; check: control-plane                                                                                                                                                                                                                                    |
| `package-boundaries`       | pnpm run check:boundaries (Nx: repository:check:boundaries)           | blocking      | node-24, node-26  | —                                                  | core-source, hevy-client-source, operations-source, worker-bundle | control-plane; check: boundaries                                                                                                                                                                                                                                       |
| `package-exports`          | npx nx run repository:check:exports                                   | blocking      | node-24, node-26  | —                                                  | —                                                                 | control-plane; check: exports                                                                                                                                                                                                                                          |
| `package-publint`          | npx nx run repository:check:publint                                   | blocking      | node-24           | —                                                  | —                                                                 | control-plane; check: publint                                                                                                                                                                                                                                          |
| `package-changesets`       | npx nx run repository:check:package-changesets                        | blocking      | node-24           | —                                                  | —                                                                 | control-plane; check: changesets                                                                                                                                                                                                                                       |
| `changeset-status`         | pnpm run check:changeset (Nx: repository:check:changeset)             | blocking      | node-24           | —                                                  | —                                                                 | changeset-status                                                                                                                                                                                                                                                       |
| `types`                    | pnpm run check:types (Nx: repository:check:types)                     | blocking      | node-24, node-26  | —                                                  | core-source, hevy-client-source, operations-source                | typescript; project: tsconfig.json                                                                                                                                                                                                                                     |
| `check`                    | npx nx run repository:check                                           | blocking      | node-24, node-26  | —                                                  | —                                                                 | repository-check                                                                                                                                                                                                                                                       |
| `build`                    | pnpm run build (Nx: repository:build)                                 | blocking      | node-24, node-26  | —                                                  | node-dist                                                         | package-build; workspace: hevy-mcp                                                                                                                                                                                                                                     |
| `worker-bundle`            | pnpm run worker:dry-run (Nx: repository:worker:dry-run)               | blocking      | workerd           | —                                                  | worker-bundle                                                     | wrangler-dry-run                                                                                                                                                                                                                                                       |
| `server-manifest`          | pnpm run check:server-manifest (Nx: repository:check:server-manifest) | blocking      | node-24, node-26  | —                                                  | server-manifest                                                   | manifest-drift                                                                                                                                                                                                                                                         |
| `docker`                   | external: docker workflow                                             | blocking      | node-24           | —                                                  | docker-image                                                      | docker-smoke                                                                                                                                                                                                                                                           |
| `generation`               | pnpm run check:generated (Nx: repository:check:generated)             | blocking      | node-24, node-26  | —                                                  | generated-client                                                  | generated-output-closure                                                                                                                                                                                                                                               |
| `integration-live`         | pnpm run test:live (Nx: repository:test:live)                         | release       | node-24           | HEVY_API_KEY                                       | live-diagnostics                                                  | vitest-live                                                                                                                                                                                                                                                            |
| `worker-http-live`         | pnpm run test:worker-http:live (Nx: repository:test:worker-http:live) | release       | workerd           | HEVY_API_KEY, HEVY_RUN_LIVE_WORKER_TESTS           | live-worker-diagnostics                                           | worker-live                                                                                                                                                                                                                                                            |
| `release-integration`      | pnpm run test:integration (Nx: repository:test:integration)           | release       | node-24           | HEVY_API_KEY                                       | live-diagnostics                                                  | vitest-integration; include: tests/integration/**                                                                                                                                                                                                                      |
| `nightly`                  | pnpm run test:nightly (Nx: repository:test:nightly)                   | nightly       | node-24           | HEVY_API_KEY, HEVY_MCP_COMMAND, HEVY_MCP_ARGS_JSON | nightly-diagnostics                                               | launcher-canary                                                                                                                                                                                                                                                        |
| `diagnostics`              | npx nx run repository:test:diagnostics                                | blocking      | node-24           | —                                                  | —                                                                 | node-test; include: tests/nightly/diagnostics.test.mjs                                                                                                                                                                                                                 |

| Aggregate ID      | Nx target / command                    | Members                                                                                                                                                                                                                                                                                                  | Count | Mapping  |
| ----------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- |
| `pull-request`    | npx nx run repository:test:pr          | `unit`, `mocked-mcp`, `contract`, `stdio`, `worker`, `worker-http`, `pack`, `cli`, `pack-cli`, `package-publint`                                                                                                                                                                                         | 10    | mapped   |
| `pull-request-ci` | external: github-actions               | `repository-control-plane`, `package-boundaries`, `package-exports`, `package-publint`, `types`, `server-manifest`, `check`, `package-changesets`, `diagnostics`, `build`, `worker-http`, `worker`, `mocked-mcp`, `unit`, `contract`, `stdio`, `pack`, `cli`, `pack-cli`, `worker-bundle`, `performance` | 21    | external |
| `release`         | npx nx run repository:release:validate | `build`, `server-manifest`, `release-unit`, `worker`, `pack`, `cli`, `pack-cli`, `package-publint`, `release-integration`, `nightly`, `worker-http-live`                                                                                                                                                 | 11    | mapped   |
| `pre-push`        | npx nx run repository:pre-push         | `types`, `changeset-status`, `pull-request`                                                                                                                                                                                                                                                              | 3     | mapped   |

## Nx cache policy

Nx remote caching is enabled for deterministic checks, client generation, and
the Workerd test lane when their named inputs include the source files, test
files, and runtime configuration they consume. The live Hevy, release
integration, nightly, live Worker, Wrangler-backed HTTP Worker, packaging, and
publish-oriented lanes stay uncached so a cache hit cannot hide an
external-service or environment failure.
Use `--skip-nx-cache` when a fresh execution of a cacheable lane is required.

## Lane ownership

| Command                          | Current owner and purpose                                                                                     | Network and credentials                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm run test:unit`             | Repository unit/component tests, excluding integration and performance discovery.                             | Deterministic; no network or credentials.                                          |
| `pnpm run test:mcp`              | Existing Nock-backed, in-memory MCP client/server integration coverage.                                       | Outbound network disabled by the tests; fake API key only.                         |
| `pnpm run test:contract`         | Current registration, output-schema, server-manifest, and initial runtime-matrix contract coverage.           | Deterministic. Issue #880 owns expansion to the complete MCP contract matrix.      |
| `pnpm run test:stdio`            | Current stdio instrumentation and graceful-shutdown/process regression baseline.                              | Deterministic. Issue #609 owns full spawned built-stdio coverage.                  |
| `pnpm run test:pack`             | Builds the shared package candidates once, then inspects, installs, and spawns the same Node tarball.         | Deterministic; the candidate producer is the only task that writes package output. |
| `pnpm run test:live`             | Read-only source canary against Hevy.                                                                         | Requires `HEVY_API_KEY`; fails before Vitest starts when absent.                   |
| `pnpm run test:worker-http:live` | Local Wrangler Worker canary with comprehensive bounded representative reads against Hevy.                    | Requires `HEVY_RUN_LIVE_WORKER_TESTS=1` and `HEVY_API_KEY`; trusted CI only.       |
| `pnpm run test:nightly`          | Published/source launcher canary configured by the nightly or release workflow.                               | Requires `HEVY_API_KEY` and launcher variables; preflight fails when absent.       |
| `pnpm run test:performance`      | Reuses the shared Node build, then spawns `dist/cli.mjs` for a mocked performance/correctness trend baseline. | Child-local Nock, fake API key, and child HTTP(S)/`fetch` disabled.                |
| `pnpm run test:pr`               | Deterministic named lanes expected on every pull request.                                                     | No live credentials or live network.                                               |

The current contract, stdio, and package commands are intentionally narrow but
real. They do not claim the complete scope assigned to issues #607 and #609.
The package lanes share one immutable tarball per package within a validation
graph. Changesets still repacks packages during publication; issue #882 owns
the later handoff needed to make the validated and published tarballs identical.

## Exact commands

Run the pull-request baseline with:

```sh
MISE_AUTO_INSTALL=false mise exec -- pnpm run test:pr
MISE_AUTO_INSTALL=false mise exec -- pnpm run test:performance
```

The aggregate table identifies the current Nx targets and direct members. Nx
owns local aggregate ordering and dependencies; contributor-facing `pnpm run`
aliases remain compatibility entrypoints, while internal-only lanes use their
Nx commands directly. Inspect the current target graph with:

```sh
npx nx show project repository --json
npx nx graph --file=.nx/project-graph.html
```

The repository `test:unit` target is marked exclusive in `project.json`.
This keeps its spawned CLI startup tests from competing with other
CPU-intensive PR lanes on small local runners; the documented `test:pr`
command remains parallel where safe and needs no manual `--parallel=1`
override.

CI selects its reporters and coverage outputs through the same lane wrappers,
so selectors do not drift between local and hosted runs:

```sh
MISE_AUTO_INSTALL=false mise exec -- env HEVY_TEST_REPORT_MODE=ci pnpm run test:unit
MISE_AUTO_INSTALL=false mise exec -- env HEVY_TEST_REPORT_MODE=ci pnpm run test:mcp
```

The build workflow invokes mapped targets per Node runtime with Nx `run-many`:
Node 24 runs worker, contract, stdio, CLI, and dry-run targets, while Node 26
runs selected repository checks, unit, and mocked MCP targets. The release
workflow does the same for its deterministic candidate-validation subset. Nx
owns dependency ordering and concurrency, while the control-plane projection
still checks every individual lane and runtime against the canonical aggregate.

Explicit live commands are separate and credential-gated. Keep the key in
`.env` or the process environment, never in command arguments, URLs, logs, or
fixtures:

```sh
MISE_AUTO_INSTALL=false mise exec -- pnpm run test:live
MISE_AUTO_INSTALL=false mise exec -- pnpm run test:integration
MISE_AUTO_INSTALL=false mise exec -- pnpm run test:worker-http:live
MISE_AUTO_INSTALL=false mise exec -- env HEVY_MCP_COMMAND=node \
	HEVY_MCP_ARGS_JSON='["dist/cli.mjs"]' \
	pnpm run test:nightly
```

`test:live` requires `HEVY_API_KEY` and fails before Vitest starts when the key
is absent. `test:integration` is also credential-gated for its live cases; when
the key is absent, its live describe is skipped and it does not contact Hevy.
The integration command uses Node's optional `--env-file-if-exists=.env` loader,
so a key stored only in the worktree `.env` is available to those cases without
being placed in command arguments or logs.
Neither command sets or requires `HEVY_RUN_LIVE_WORKER_TESTS=1`. The separate
`test:worker-http:live` lane is optional and is not required for this milestone
or for the normal PR baseline.

None of the live commands belong in deterministic pull-request jobs. The live
Worker lane, when explicitly run, starts `wrangler dev --local`, sends the API
key only through the MCP client's bearer header, and uses the default
production Hevy API endpoint. Its production calls are bounded representative reads;
`search-exercise-templates` is checked through `tools/list` only because calling
it would load the full exercise catalog.

## Performance scenarios and report

`pnpm run test:performance` depends on the shared Node build, then uses the MCP SDK
`StdioClientTransport` to spawn the real `dist/cli.mjs` with `process.execPath`.
Build time is therefore outside every latency sample. A child-only Node
`--import` preload installs deterministic Nock fixtures before the CLI loads,
requires the dedicated fake API key, disables Node HTTP(S) connections, and
rejects `globalThis.fetch` so the background update check cannot contact npm.
The expected blocked npm-registry URL is recorded; any other fetch target is an
unexpected request and fails fixture verification. It never contacts live Hevy.
Issue #609 remains responsible for the broader installed-tarball expansion.
Hosted pull-request CI runs this lane in its own Node 24 job so concurrent unit,
type, and bundle work cannot distort the latency samples; package smoke checks
reuse that job's already-built release candidates after the measurements finish.

The lane records exactly five stable scenarios:

1. `startup-initialization` — 10 process launches through MCP initialize.
2. `mcp-tools-list` — 20 MCP `tools/list` calls on one initialized process.
3. `representative-mocked-read` — 20 child-mocked `get-workout` calls.
4. `concurrent-20-call-burst` — one burst of 20 correlated mocked workout reads.
5. `sequential-100-mocked-reads` — 100 ordered mocked reads.

The versioned JSON report is written to the ignored stable path
`test-results/performance/summary.json`. It includes the commit, Node/runtime
environment, platform, architecture, CPU/runner metadata, fixture/network mode,
configured/completed iteration counts, p50/p95/max durations, correctness
failures, exact child fixture verification, and server-process RSS observations
from `/proc/<pid>/status` on Linux (nullable with an explicit reason elsewhere).
Parent/runner memory is labeled separately.

### Gates and initial targets

Every scenario contributes an entry even when setup or cleanup fails, and a
failed attempt records its measured duration rather than a fabricated zero. The
schema-validated report is written before the Vitest correctness assertion.
Missing/malformed child markers, mode/count mismatches, pending mocks,
unexpected requests, setup failures, and cleanup failures gate immediately.
Timing remains informational only:

- Startup plus initialize p95: less than 2 seconds.
- MCP `tools/list` p95: less than 100 ms.
- Representative mocked read p95: less than 500 ms.
- The 20-call burst must preserve response correlation and content.
- The 100-call sequence must remain correct with no pending fixtures.

Collect results on the primary Node 24 hosted runner for **2–4 weeks** before
considering timing gates. A later review must measure runner variance and choose
a regression budget; no timing target is a blocking threshold today.
