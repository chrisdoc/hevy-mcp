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
| `npm run test:performance` | Local mocked performance and correctness trend baseline.                                   | Nock only, fake API key, and all outbound network disabled.                    |
| `npm run test:coverage`    | Unit and mocked MCP coverage reports in their existing separate directories.               | Deterministic. Issue #611 owns the merged denominator and ratchet.             |
| `npm run test:pr`          | Deterministic named lanes expected on every pull request.                                  | No live credentials or live network.                                           |

The current contract, stdio, and package commands are intentionally narrow but
real. They do not claim the complete scope assigned to issues #607 and #609.

## Exact commands

Run the pull-request baseline with:

```sh
npm run test:pr
npm run test:performance
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
HEVY_MCP_COMMAND=node \
	HEVY_MCP_ARGS_JSON='["dist/cli.mjs"]' \
	npm run test:nightly
```

Neither live command belongs in deterministic pull-request jobs.

## Performance scenarios and report

`npm run test:performance` uses the real MCP SDK, `McpServer`, linked
`InMemoryTransport`, deterministic Nock fixtures, and a fake API key. It never
contacts live Hevy. Issue #609 remains responsible for process-boundary and
installed-tarball testing.

The lane records exactly five stable scenarios:

1. `startup-initialization` — 10 full server/client initialization iterations.
2. `mcp-tools-list` — 20 MCP `tools/list` calls.
3. `representative-mocked-read` — 20 Nock-backed `get-workout-count` calls.
4. `concurrent-20-call-burst` — one burst of 20 correlated mocked workout reads.
5. `sequential-100-mocked-reads` — 100 ordered mocked reads.

The versioned JSON report is written to the ignored stable path
`test-results/performance/summary.json`. It includes the commit, Node/runtime
environment, platform, architecture, CPU/runner metadata, fixture/network mode,
per-scenario iteration counts, p50/p95/max durations, correctness failures, and
memory observations.

### Gates and initial targets

Correctness, fixture completion, schema validity, and network isolation gate the
lane immediately. Timing is informational only:

- Startup plus initialize p95: less than 2 seconds.
- MCP `tools/list` p95: less than 100 ms.
- Representative mocked read p95: less than 500 ms.
- The 20-call burst must preserve response correlation and content.
- The 100-call sequence must remain correct with no pending fixtures.

Collect results on the primary Node 24 hosted runner for **2–4 weeks** before
considering timing gates. A later review must measure runner variance and choose
a regression budget; no timing target is a blocking threshold today.
