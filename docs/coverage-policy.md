# Coverage policy

This document defines the repository-owned production denominator, the exact
project ratchet, and Codecov's changed-line policy.

## Denominator and merged-main baseline

Coverage includes every `src/**/*.ts` file except co-located tests matching
`src/**/*.test.ts` and generated Kubb output under `src/generated/**`. Generated
code is the only production-tree exclusion because the repository does not own
its implementation; entry points such as `src/index.ts` and `src/cli.ts` remain
in the denominator even when uncovered. Build configuration, scripts, and tests
are outside `src/**/*.ts` naturally.

The committed schema-version-1 baseline in [`coverage-baseline.json`](../coverage-baseline.json)
was measured in an isolated worktree at merged main commit
`0f03660348a5a83a6d0af313b0df773b4d2781ff`. The explicit coverage
include/exclude/report configuration now recorded in `vitest.config.ts` was
temporarily applied to that worktree, then the repository's installed Vitest
binary was invoked directly (shown here with a portable local-binary command):

```sh
npx --no-install vitest run --coverage --exclude 'tests/integration/hevy-mcp.integration.test.ts' --exclude 'tests/performance/**'
```

The measurement used Node `v24.18.0` and Vitest `4.1.10`. The historical commit
did not contain `npm run test:coverage:collect`; that script is the current
canonical equivalent of the direct command above. The baseline's sorted file
list is the exact 34-file denominator at that commit. Counts, not rounded
percentages, are canonical:

| Metric     | Covered / total | Display percentage |
| ---------- | --------------- | ------------------ |
| Statements | 1287 / 1329     | 96.83%             |
| Lines      | 1275 / 1317     | 96.81%             |
| Functions  | 241 / 258       | 93.41%             |
| Branches   | 821 / 907       | 90.51%             |

Review established that merged main was already above the permanent project
floors of 85% statements, 85% lines, 85% functions, and 75% branches, as well
as the hosted 90% patch target. These policies therefore apply immediately;
there is no transition plan or tolerance window.

## Local and CI enforcement

`npm run test:coverage` performs one aggregate deterministic Vitest collection
and then runs `scripts/check-coverage-ratchet.mjs`. The collection includes all
unit/co-located tests, mocked MCP integration tests, contract tests, and
stdio-relevant Vitest tests. It excludes the credentialed live integration test
and `tests/performance/**`; performance tests spawn built child processes and do
not produce meaningful in-process source instrumentation. The command never
requires a Hevy API key or contacts live Hevy.

Vitest writes `coverage/coverage-summary.json` and `coverage/lcov.info`. The
local/CI checker is authoritative for exact project behavior: it independently
enumerates the current worktree denominator, requires the report file set to
match exactly, checks permanent floors with integer multiplication, and rejects
any ratio below the committed baseline using cross multiplication. New
production files enter the denominator automatically, so untested additions
lower the measured ratio instead of disappearing from the report.

CI runs the aggregate collection and ratchet on the primary Node 24 lane, then
uploads only the explicit `coverage/lcov.info` report to Codecov. Codecov
enforces an 85% overall project floor and a 90% patch target, both with zero
threshold tolerance. The local exact-count checker is authoritative for no
regression across every metric and for the exact production-file denominator.

Historical Codecov aggregate percentages are not a project ratchet because the
report composition changed when this explicit denominator was established. No
intended source file is ignored, and neither the local policy nor Codecov
introduces a nonzero tolerance.

## Deliberate baseline updates

An unexplained regression must be fixed, not hidden with threshold tolerance or
new exclusions. If maintainers review and accept an intentional project ratio
change, update `coverage-baseline.json` deliberately:

1. Start from the exact merged `origin/main` commit being recorded, not an
   unmerged feature or dependency branch.
2. Use the pinned Node version and installed Vitest version, then run
   `npm run test:coverage:collect` with the policy unchanged.
3. Verify the report file set, copy the sorted production file list and integer
   `{covered,total}` counts, and record the full commit/runtime/command
   provenance.
4. Explain the reviewed reason in the pull request. Run `npm run test:coverage`
   to prove the new baseline and current worktree agree.

## Risk-heavy modules

Changes to entry/bootstrap behavior (`src/index.ts`, `src/cli.ts`), the Hevy
adapter, error handling and output schemas, `src/utils/stdio-observability.ts`,
cache/catalog state, or mutation tools need focused deterministic
success/error/boundary tests. Do not use blanket exclusions for these modules.
Their changed lines are expected to meet or exceed the 90% Codecov patch target.
