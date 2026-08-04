# Test lanes and performance baseline

This document owns the stable public commands introduced by testing-strategy
ticket TS-06. Contributors and CI should use these names instead of copying raw
Vitest selectors.

The lane and aggregate registry below is generated from
[`repository/validation-lanes.json`](../repository/validation-lanes.json). The
plain renderer command is a drift check; use `--write` after an intentional
model change. It derives contributor aliases and Nx targets from the model and
does not add dispatcher commands to that model.

<!-- repository-control-plane:validation-lanes:start -->

| Lane ID                    | Command / integration                                                      | Gate          | Runtime ownership | Credentials                                        | Artifacts                                                         | Purpose                                                                                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------- | ------------- | ----------------- | -------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit`                     | npm run test:unit (Nx: repository:test:unit)                               | blocking      | node-24, node-26  | —                                                  | unit-coverage, unit-junit                                         | vitest; exclude: tests/integration/**, tests/performance/**                                                                                                                                                               |
| `release-unit`             | npm run test:release-unit (Nx: repository:test:release-unit)               | blocking      | node-24, node-26  | —                                                  | —                                                                 | vitest; exclude: tests/integration/**                                                                                                                                                                                     |
| `mocked-mcp`               | npm run test:mcp (Nx: repository:test:mcp)                                 | blocking      | node-24, node-26  | —                                                  | mocked-coverage                                                   | vitest; include: tests/integration/mocked/**                                                                                                                                                                              |
| `contract`                 | npm run test:contract (Nx: repository:test:contract)                       | blocking      | node-24           | —                                                  | —                                                                 | vitest; include: packages/node/src/index.test.ts, packages/node/src/utils/config.test.ts, packages/core/src/tools/register.test.ts, packages/core/src/utils/output-schemas.test.ts, tests/unit/server-manifest.test.ts    |
| `stdio`                    | npm run test:stdio (Nx: repository:test:stdio)                             | blocking      | node-24           | —                                                  | stdio-diagnostics                                                 | vitest; include: packages/node/src/index.test.ts, packages/node/src/utils/stdio-observability.test.ts, packages/node/src/utils/graceful-shutdown.test.ts, packages/node/src/utils/graceful-shutdown.child-process.test.ts |
| `worker`                   | npm run test:worker (Nx: repository:test:worker)                           | blocking      | workerd           | —                                                  | —                                                                 | vitest-worker-config; config: vitest.workers.config.ts                                                                                                                                                                    |
| `worker-http`              | npm run test:worker-http (Nx: repository:test:worker-http)                 | blocking      | workerd           | —                                                  | worker-bundle                                                     | vitest; include: tests/integration/worker-http.integration.test.ts                                                                                                                                                        |
| `pack`                     | npm run test:pack (Nx: repository:test:pack)                               | blocking      | node-24           | —                                                  | node-package-tarball                                              | npm-pack-smoke                                                                                                                                                                                                            |
| `cli`                      | npm run test:cli (Nx: repository:test:cli)                                 | blocking      | node-24           | —                                                  | cli-dist                                                          | workspace-test; workspace: @chrisdoc/hevy-cli                                                                                                                                                                             |
| `pack-cli`                 | npm run test:pack:cli (Nx: repository:test:pack:cli)                       | blocking      | node-24           | —                                                  | cli-package-tarball                                               | npm-pack-smoke; workspace: @chrisdoc/hevy-cli                                                                                                                                                                             |
| `performance`              | npm run test:performance (Nx: repository:test:performance)                 | informational | node-24           | —                                                  | performance-summary                                               | vitest; include: tests/performance/performance.test.ts                                                                                                                                                                    |
| `repository-control-plane` | npm run check:control-plane (Nx: repository:check:control-plane)           | blocking      | node-24, node-26  | —                                                  | —                                                                 | control-plane; check: control-plane                                                                                                                                                                                       |
| `workspace-topology`       | npm run check:workspaces (Nx: repository:check:workspaces)                 | blocking      | node-24, node-26  | —                                                  | —                                                                 | control-plane; check: topology                                                                                                                                                                                            |
| `package-boundaries`       | npm run check:boundaries (Nx: repository:check:boundaries)                 | blocking      | node-24, node-26  | —                                                  | core-source, hevy-client-source, operations-source, worker-bundle | control-plane; check: boundaries                                                                                                                                                                                          |
| `package-exports`          | npm run check:exports (Nx: repository:check:exports)                       | blocking      | node-24, node-26  | —                                                  | —                                                                 | control-plane; check: exports                                                                                                                                                                                             |
| `release-candidates`       | npm run check:release-candidates (Nx: repository:check:release-candidates) | blocking      | node-24, node-26  | —                                                  | —                                                                 | control-plane; check: release-candidates                                                                                                                                                                                  |
| `package-changesets`       | npm run check:package-changesets (Nx: repository:check:package-changesets) | blocking      | node-24           | —                                                  | —                                                                 | control-plane; check: changesets                                                                                                                                                                                          |
| `changeset-status`         | npm run check:changeset (Nx: repository:check:changeset)                   | blocking      | node-24           | —                                                  | —                                                                 | changeset-status                                                                                                                                                                                                          |
| `types`                    | npm run check:types (Nx: repository:check:types)                           | blocking      | node-24, node-26  | —                                                  | core-source, hevy-client-source, operations-source                | typescript; project: tsconfig.json                                                                                                                                                                                        |
| `check`                    | npx nx run repository:check                                                | blocking      | node-24, node-26  | —                                                  | —                                                                 | repository-check                                                                                                                                                                                                          |
| `build`                    | npm run build (Nx: repository:build)                                       | blocking      | node-24, node-26  | —                                                  | node-dist                                                         | package-build; workspace: hevy-mcp                                                                                                                                                                                        |
| `worker-bundle`            | npm run worker:dry-run (Nx: repository:worker:dry-run)                     | blocking      | workerd           | —                                                  | worker-bundle                                                     | wrangler-dry-run                                                                                                                                                                                                          |
| `server-manifest`          | npm run check:server-manifest (Nx: repository:check:server-manifest)       | blocking      | node-24, node-26  | —                                                  | server-manifest                                                   | manifest-drift                                                                                                                                                                                                            |
| `docker`                   | external: docker workflow                                                  | blocking      | node-24           | —                                                  | docker-image                                                      | docker-smoke                                                                                                                                                                                                              |
| `generation`               | npm run check:generated (Nx: repository:check:generated)                   | blocking      | node-24, node-26  | —                                                  | generated-client                                                  | generated-output-closure                                                                                                                                                                                                  |
| `integration-live`         | npm run test:live (Nx: repository:test:live)                               | release       | node-24           | HEVY_API_KEY                                       | live-diagnostics                                                  | vitest-live                                                                                                                                                                                                               |
| `worker-http-live`         | npm run test:worker-http:live (Nx: repository:test:worker-http:live)       | release       | workerd           | HEVY_API_KEY, HEVY_RUN_LIVE_WORKER_TESTS           | live-worker-diagnostics                                           | worker-live                                                                                                                                                                                                               |
| `release-integration`      | npm run test:integration (Nx: repository:test:integration)                 | release       | node-24           | HEVY_API_KEY                                       | live-diagnostics                                                  | vitest-integration; include: tests/integration/**                                                                                                                                                                         |
| `nightly`                  | npm run test:nightly (Nx: repository:test:nightly)                         | nightly       | node-24           | HEVY_API_KEY, HEVY_MCP_COMMAND, HEVY_MCP_ARGS_JSON | nightly-diagnostics                                               | launcher-canary                                                                                                                                                                                                           |
| `diagnostics`              | npx nx run repository:test:diagnostics                                     | blocking      | node-24           | —                                                  | —                                                                 | node-test; include: tests/nightly/diagnostics.test.mjs                                                                                                                                                                    |

<!-- repository-control-plane:validation-aggregates:start -->

| Aggregate ID      | Nx target / command                    | Members                                                                                                                                                                                                                                                                                              | Count | Mapping  |
| ----------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- |
| `pull-request`    | npx nx run repository:test:pr          | `unit`, `mocked-mcp`, `contract`, `stdio`, `worker`, `worker-http`, `pack`, `cli`, `pack-cli`                                                                                                                                                                                                        | 9     | mapped   |
| `pull-request-ci` | external: github-actions               | `repository-control-plane`, `workspace-topology`, `package-boundaries`, `package-exports`, `release-candidates`, `types`, `server-manifest`, `check`, `package-changesets`, `diagnostics`, `build`, `worker-http`, `mocked-mcp`, `unit`, `contract`, `stdio`, `pack`, `worker-bundle`, `performance` | 19    | external |
| `release`         | npx nx run repository:release:validate | `build`, `release-unit`, `pack`, `release-integration`, `nightly`, `worker-http-live`                                                                                                                                                                                                                | 6     | mapped   |
| `pre-push`        | npx nx run repository:pre-push         | `types`, `changeset-status`, `pull-request`                                                                                                                                                                                                                                                          | 3     | mapped   |

<!-- repository-control-plane:validation-aggregates:end -->

<!-- repository-control-plane:validation-lanes:end -->

## Lane ownership

| Command                         | Current owner and purpose                                                                  | Network and credentials                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `npm run test:unit`             | Repository unit/component tests, excluding integration and performance discovery.          | Deterministic; no network or credentials.                                      |
| `npm run test:mcp`              | Existing Nock-backed, in-memory MCP client/server integration coverage.                    | Outbound network disabled by the tests; fake API key only.                     |
| `npm run test:contract`         | Current registration, output-schema, and server-manifest contract baseline.                | Deterministic. Issue #607 owns expansion to the complete MCP contract matrix.  |
| `npm run test:stdio`            | Current stdio instrumentation and graceful-shutdown/process regression baseline.           | Deterministic. Issue #609 owns full spawned built-stdio coverage.              |
| `npm run test:pack`             | Builds and inspects the `npm pack --dry-run` inventory, binary mapping, and package files. | Deterministic. Issue #609 owns install-and-spawn coverage of the real tarball. |
| `npm run test:live`             | Read-only source canary against Hevy.                                                      | Requires `HEVY_API_KEY`; fails before Vitest starts when absent.               |
| `npm run test:worker-http:live` | Local Wrangler Worker canary with comprehensive bounded representative reads against Hevy. | Requires `HEVY_RUN_LIVE_WORKER_TESTS=1` and `HEVY_API_KEY`; trusted CI only.   |
| `npm run test:nightly`          | Published/source launcher canary configured by the nightly or release workflow.            | Requires `HEVY_API_KEY` and launcher variables; preflight fails when absent.   |
| `npm run test:performance`      | Builds, then spawns `dist/cli.mjs` for a mocked performance/correctness trend baseline.    | Child-local Nock, fake API key, and child HTTP(S)/`fetch` disabled.            |
| `npm run test:coverage`         | Unit and mocked MCP coverage reports in their existing separate directories.               | Deterministic. Issue #611 owns the merged denominator and ratchet.             |
| `npm run test:pr`               | Deterministic named lanes expected on every pull request.                                  | No live credentials or live network.                                           |

The current contract, stdio, and package commands are intentionally narrow but
real. They do not claim the complete scope assigned to issues #607 and #609.

## Exact commands

Run the pull-request baseline with:

```sh
npm run test:pr
npm run test:performance
```

The generated aggregate table identifies the current Nx targets and direct
members. Nx owns local aggregate ordering and dependencies; the `npm run`
aliases above remain compatibility entrypoints for contributors and external
automation. Inspect the current target graph with:

```sh
npx nx show project repository --json
npx nx graph --file=.nx/project-graph.html
```

To verify or refresh the generated tables:

```sh
node scripts/render-validation-lanes.mjs
node scripts/render-validation-lanes.mjs --write
```

CI can add reporters and coverage settings after `--` while retaining the same
selector, for example:

```sh
npm run test:unit -- --coverage --coverage.reportsDirectory=coverage/unit
npm run test:mcp -- --coverage --coverage.reportsDirectory=coverage/mocked
```

Explicit live commands are separate and credential-gated:

```sh
npm run test:live
HEVY_RUN_LIVE_WORKER_TESTS=1 npm run test:worker-http:live
HEVY_MCP_COMMAND=node \
	HEVY_MCP_ARGS_JSON='["dist/cli.mjs"]' \
	npm run test:nightly
```

None of the live commands belong in deterministic pull-request jobs. The live
Worker lane starts `wrangler dev --local`, sends the API key only through the
MCP client's bearer header, and uses the default production Hevy API endpoint.
Its production calls are bounded representative reads;
`search-exercise-templates` is checked through `tools/list` only because calling
it would load the full exercise catalog.

## Performance scenarios and report

`npm run test:performance` builds first, then uses the MCP SDK
`StdioClientTransport` to spawn the real `dist/cli.mjs` with `process.execPath`.
Build time is therefore outside every latency sample. A child-only Node
`--import` preload installs deterministic Nock fixtures before the CLI loads,
requires the dedicated fake API key, disables Node HTTP(S) connections, and
rejects `globalThis.fetch` so the background update check cannot contact npm.
The expected blocked npm-registry URL is recorded; any other fetch target is an
unexpected request and fails fixture verification. It never contacts live Hevy.
Issue #609 remains responsible for the broader installed-tarball expansion.

The lane records exactly five stable scenarios:

1. `startup-initialization` — 10 process launches through MCP initialize.
2. `mcp-tools-list` — 20 MCP `tools/list` calls on one initialized process.
3. `representative-mocked-read` — 20 child-mocked `get-workout-count` calls.
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
