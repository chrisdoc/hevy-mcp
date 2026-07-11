# Test lanes and performance baseline

This document owns the stable public commands introduced by testing-strategy
ticket TS-06. Contributors and CI should use these names instead of copying raw
Vitest selectors.

## Lane ownership

| Command                    | Current owner and purpose                                                                  | Network and credentials                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `npm run test:unit`        | Repository unit/component tests, excluding integration and performance discovery.          | Deterministic; no network or credentials.                                      |
| `npm run test:mcp`         | Existing Nock-backed, in-memory MCP client/server integration coverage.                    | Outbound network disabled by the tests; fake API key only.                     |
| `npm run test:contract`    | Current registration, output-schema, and server-manifest contract baseline.                | Deterministic. Issue #607 owns expansion to the complete MCP contract matrix.  |
| `npm run test:stdio`       | Current stdio instrumentation and graceful-shutdown/process regression baseline.           | Deterministic. Issue #609 owns full spawned built-stdio coverage.              |
| `npm run test:pack`        | Builds and inspects the `npm pack --dry-run` inventory, binary mapping, and package files. | Deterministic. Issue #609 owns install-and-spawn coverage of the real tarball. |
| `npm run test:live`        | Read-only source canary against Hevy.                                                      | Requires `HEVY_API_KEY`; fails before Vitest starts when absent.               |
| `npm run test:nightly`     | Published/source launcher canary configured by the nightly or release workflow.            | Requires `HEVY_API_KEY` and launcher variables; preflight fails when absent.   |
| `npm run test:performance` | Builds, then spawns `dist/cli.mjs` for a mocked performance/correctness trend baseline.    | Child-local Nock, fake API key, and child HTTP(S)/`fetch` disabled.            |
| `npm run test:coverage`    | One aggregate deterministic report plus the exact project ratchet.                         | Deterministic; never runs live or performance tests.                           |
| `npm run test:pr`          | Deterministic named lanes expected on every pull request.                                  | No live credentials or live network.                                           |

The current contract, stdio, and package commands are intentionally narrow but
real. They do not claim the complete scope assigned to issues #607 and #609.

## Exact commands

Run the pull-request baseline with:

```sh
npm run test:pr
npm run test:performance
```

The canonical coverage policy and baseline are documented in
[`docs/coverage-policy.md`](./coverage-policy.md). Collect and enforce it with:

```sh
npm run test:coverage
```

This writes the single authoritative `coverage/coverage-summary.json` and
`coverage/lcov.info`. The collection includes unit/co-located, mocked MCP,
contract, and stdio-relevant Vitest tests while excluding live integration and
spawned performance tests.

Explicit live commands are separate and credential-gated:

```sh
npm run test:live
HEVY_MCP_COMMAND=node \
	HEVY_MCP_ARGS_JSON='["dist/cli.mjs"]' \
	npm run test:nightly
```

Neither live command belongs in deterministic pull-request jobs.

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
