# Validation lane inventory

Generated from registry v1 on Node v24.20.0 using Vitest test discovery. This
records test identities and declared lane dimensions; matching identities are
not proof that lanes are interchangeable. Runtime, setup, environment,
credentials, report, and artifact differences remain relevant.

Regenerate the summary with `mise exec -- pnpm run report:test-lanes`. Use
`mise exec -- pnpm run report:test-lanes -- --format=json` for every registered
test identity and per-lane occurrence count.

## Lane inventory

| Lane                       | Aggregate                              | Execution runtime matrix       | CI runner override | Discovery      | Cases / files | Credentials                                        | Artifacts                                                         |
| -------------------------- | -------------------------------------- | ------------------------------ | ------------------ | -------------- | ------------: | -------------------------------------------------- | ----------------------------------------------------------------- |
| `unit`                     | pull-request, pull-request-ci          | node-24 (24.x), node-26 (26.x) | —                  | enumerated     |          1299 | —                                                  | unit-coverage, unit-junit                                         |
| `release-unit`             | release                                | node-24 (24.x), node-26 (26.x) | node-24            | enumerated     |          1302 | —                                                  | —                                                                 |
| `mocked-mcp`               | pull-request, pull-request-ci          | node-24 (24.x), node-26 (26.x) | —                  | enumerated     |           109 | —                                                  | mocked-coverage                                                   |
| `contract`                 | pull-request, pull-request-ci          | node-24 (24.x)                 | —                  | enumerated     |            44 | —                                                  | —                                                                 |
| `stdio`                    | pull-request, pull-request-ci          | node-24 (24.x)                 | —                  | enumerated     |            55 | —                                                  | stdio-diagnostics                                                 |
| `worker`                   | pull-request, pull-request-ci, release | workerd (wrangler-local)       | node-24            | enumerated     |             2 | —                                                  | —                                                                 |
| `worker-http`              | pull-request, pull-request-ci          | workerd (wrangler-local)       | node-24            | enumerated     |            11 | —                                                  | worker-bundle                                                     |
| `pack`                     | pull-request, pull-request-ci, release | node-24 (24.x)                 | —                  | not-applicable |             — | —                                                  | node-package-tarball                                              |
| `cli`                      | pull-request, pull-request-ci, release | node-24 (24.x)                 | —                  | enumerated     |            80 | —                                                  | cli-dist                                                          |
| `pack-cli`                 | pull-request, pull-request-ci, release | node-24 (24.x)                 | —                  | not-applicable |             — | —                                                  | cli-package-tarball                                               |
| `performance`              | pull-request-ci, release               | node-24 (24.x)                 | —                  | enumerated     |             1 | —                                                  | performance-summary                                               |
| `repository-control-plane` | pull-request-ci, pre-push              | node-24 (24.x), node-26 (26.x) | —                  | not-applicable |             — | —                                                  | —                                                                 |
| `package-boundaries`       | pull-request-ci                        | node-24 (24.x), node-26 (26.x) | —                  | not-applicable |             — | —                                                  | core-source, hevy-client-source, operations-source, worker-bundle |
| `package-exports`          | pull-request-ci                        | node-24 (24.x), node-26 (26.x) | —                  | not-applicable |             — | —                                                  | —                                                                 |
| `package-publint`          | pull-request, pull-request-ci, release | node-24 (24.x)                 | —                  | not-applicable |             — | —                                                  | —                                                                 |
| `package-changesets`       | pull-request-ci                        | node-24 (24.x)                 | —                  | not-applicable |             — | —                                                  | —                                                                 |
| `changeset-status`         | pre-push                               | node-24 (24.x)                 | —                  | not-applicable |             — | —                                                  | —                                                                 |
| `types`                    | pull-request-ci, pre-push              | node-24 (24.x), node-26 (26.x) | —                  | not-applicable |             — | —                                                  | core-source, hevy-client-source, operations-source                |
| `check`                    | pull-request-ci, pre-push              | node-24 (24.x), node-26 (26.x) | —                  | not-applicable |             — | —                                                  | —                                                                 |
| `build`                    | pull-request-ci, release               | node-24 (24.x), node-26 (26.x) | node-24            | not-applicable |             — | —                                                  | node-dist                                                         |
| `worker-bundle`            | pull-request-ci                        | workerd (wrangler-local)       | node-24            | not-applicable |             — | —                                                  | worker-bundle                                                     |
| `server-manifest`          | pull-request-ci, release               | node-24 (24.x), node-26 (26.x) | node-24            | not-applicable |             — | —                                                  | server-manifest                                                   |
| `docker`                   | —                                      | node-24 (24.x)                 | —                  | not-applicable |             — | —                                                  | docker-image                                                      |
| `generation`               | —                                      | node-24 (24.x), node-26 (26.x) | —                  | not-applicable |             — | —                                                  | generated-client                                                  |
| `integration-live`         | —                                      | node-24 (24.x)                 | —                  | not-enumerated |             — | HEVY_API_KEY                                       | live-diagnostics                                                  |
| `worker-http-live`         | release                                | workerd (wrangler-local)       | node-24            | not-enumerated |             — | HEVY_API_KEY, HEVY_RUN_LIVE_WORKER_TESTS           | live-worker-diagnostics                                           |
| `release-integration`      | release                                | node-24 (24.x)                 | —                  | not-enumerated |             — | HEVY_API_KEY                                       | live-diagnostics                                                  |
| `nightly`                  | release                                | node-24 (24.x)                 | —                  | not-enumerated |             — | HEVY_API_KEY, HEVY_MCP_COMMAND, HEVY_MCP_ARGS_JSON | nightly-diagnostics                                               |
| `diagnostics`              | pull-request-ci                        | node-24 (24.x)                 | —                  | file-only      |             1 | —                                                  | —                                                                 |

`not-applicable` marks build, package, repository, and external artifact checks;
`not-enumerated` marks credential-gated lanes excluded from discovery. The
diagnostics lane is a Node test-runner file, so this inventory records its file
but not individual test names.

## Setup, environment, and interpretation

Root Vitest lanes use `vitest.config.ts`, including
`tests/setup/cloudflare-runtime.ts` and the `cloudflare:workers` shim. The
Workerd lane uses `vitest.workers.config.ts`. The CLI lane runs `vitest run`
from its workspace. Unit sets `HEVY_UNIT_LANE=1`; pull-request CI sets
`HEVY_TEST_REPORT_MODE=ci`, which enables unit JUnit/coverage and mocked
coverage output on Node 24. Artifact IDs above come from the canonical lane
registry; concrete output paths and task dependencies are in `project.json`
and the lane runner.

Test names were registered on Node v24.20.0. The runtime matrix is configured
coverage, not a claim that this inventory command ran Node 26 or Workerd tests.
Vitest loads test modules to register exact (including parameterized) names,
but does not execute test bodies or report their pass/skip state. Unit lists
1,299 identities under `HEVY_UNIT_LANE=1`; 2 identities present only when the
flag is unset are preserved separately in JSON and excluded from overlap
counts. Credential-gated lanes were not loaded and received no credentials.

## Exact test overlaps

Identity is the repository-relative test file plus its full Vitest suite/test
name. Matching identities indicate repeated registration, not equivalent
coverage. Compare each lane’s runtime, setup, environment, report, and artifact
requirements before changing the schedule.

| Lane pair                      | Matching test identities |
| ------------------------------ | -----------------------: |
| `release-unit` / `unit`        |                     1295 |
| `cli` / `release-unit`         |                       80 |
| `cli` / `unit`                 |                       80 |
| `release-unit` / `stdio`       |                       54 |
| `stdio` / `unit`               |                       54 |
| `contract` / `release-unit`    |                       44 |
| `contract` / `unit`            |                       44 |
| `contract` / `stdio`           |                        3 |
| `performance` / `release-unit` |                        1 |

The JSON report contains every test identity, duplicate occurrence counts,
selectors, runtime and workflow matrices, setup, credentials, environment, and
artifact IDs. Credential-gated integration lanes are intentionally absent from
the test-name comparison.
