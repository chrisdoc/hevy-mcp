# Test performance and code reduction results

## Outcome

The measured optimization pass achieved **28.07% less full PR-suite time** and
**0.42% fewer physical code lines**. Neither the requested 40% time target nor
the 30% overall code target was reached. No tests, assertions, public methods,
coverage thresholds, generated output, or runtime lanes were removed to force
a percentage.

These measurements precede the separately approved CI-policy follow-up:
Node 24 remains required on PRs; Node 26 moves to scheduled compatibility. That
change reduces CI work, not the already Node-24-only local timings below. The
follow-up adds two policy regression cases and does not remove scenarios. Local
validation passed on Node 24.20.0 (1,441 unit cases plus two existing skips,
unchanged coverage thresholds) and Node 26.11.1 (1,441 unit cases plus the same
skips and 109 mocked MCP cases). The complete Node 26 compatibility graph passed
after using the completed build candidate to avoid a redundant build/typecheck
race. Workflow syntax and security audits passed; hosted execution is unrun. Code
size and case counts below describe the measured optimization revision, before
those additional policy checks.

Worktree: `perf/test-and-code-reduction`, based on `1e0b1f660344`.
Measurements used a two-CPU ARM64 Linux machine, Node 24.20.0, pnpm 12.0.0,
Vitest 4.1.11, Nx 23.2.1, and Effect 4.0.1. These local results are not a
performance guarantee for larger CI runners or another Node runtime.

## Implemented changes

- Unit execution uses at most two isolated forks; other root Vitest lanes keep
  one worker. Release-unit therefore does not introduce a new parallel race
  between performance samples and report cleanup.
- Only Effect and Effect/testing are SSR-prebundled. SDK, Zod, telemetry, and
  workspace packages retain their existing loading/mocking policy.
- Nx unit, Workerd, and Worker HTTP targets are exclusive, preventing CPU-heavy
  import/build work from competing with bounded process startup. Existing
  readiness deadlines and retry counts are unchanged.
- Cache inputs now cover additional files actually executed/read: contract
  tests, package test fixtures, lint plugin sources, Worker configuration,
  workflows, and manifests. Inputs were expanded, not narrowed for false hits.
- The client shares request configuration and response extraction. All 22
  signatures and the native Effect seam remain intact. Its unchanged interface
  has one private contract module with the existing public re-export.
- Worker/OAuth tests share request/response mechanics, retaining fresh mutable
  context/KV state. Operations tests share identical Effect fixtures and
  rejection mechanics while registering every original raw test name.
- Added 44 method-wide deadline/timeout cases and two empty-routine-response
  cases. Generated code was not edited.

## Full-suite comparison

Both revisions ran the same command, five successful repetitions each:

```sh
MISE_AUTO_INSTALL=false mise exec -- pnpm run test:pr --parallel=1
```

Each repetition used a unique empty Nx cache directory, disabled remote cache,
reset only its own worktree's Nx workspace metadata, and rejected cached-task
labels. No competing tests, compilers, or formatters ran during measurement.
Global cache-bypass flags were not used: they invalidate the nested Nx tests'
cache-hit expectations.

| Run                       | Immutable baseline (s) | Modified (s) |
| ------------------------- | ---------------------: | -----------: |
| 1                         |                187.080 |      137.687 |
| 2                         |                188.044 |      134.162 |
| 3                         |                185.616 |      134.468 |
| 4                         |                184.007 |      137.711 |
| 5                         |                186.947 |      133.240 |
| **Median**                |            **186.947** |  **134.468** |
| Sample standard deviation |                  1.564 |        2.099 |

Savings: **52.479 seconds / 28.072%**. The 40% target requires at most
112.168 seconds: another 22.300 seconds would need to be removed safely.
The unit lane's Vitest median fell from 106.46 to 59.88 seconds; other lanes,
builds, and packaging remain substantial end-to-end costs.

Normal aggregate scheduling also passed one uncached validation in
**124.108 seconds**. This is not a five-run median and is not compared against
the serialized baseline. Earlier concurrent-baseline startup failures and
cached/aborted attempts were excluded from the comparison.

Nx-cold does not mean optimizer-cold or OS-cold. The full-suite measurements
reused Vite's optimizer cache warmed during validation. First optimizer startup
was measured separately below. No whole-machine cold-start claim is made.

### Reproduce the cold-Nx protocol

Use an isolated checkout with frozen dependencies and pinned mise tools. From
that checkout, prepare a fresh directory before each timed repetition:

```sh
unset NX_SKIP_NX_CACHE HEVY_TEST_REPORT_MODE
export MISE_AUTO_INSTALL=false NX_DAEMON=false NX_SKIP_REMOTE_CACHE=true
export NX_CACHE_DIRECTORY="$(mktemp -d /tmp/hevy-pr-cache.XXXXXXXX)"
mise exec -- pnpm exec nx reset --onlyWorkspaceData
time mise exec -- pnpm run test:pr --parallel=1
```

Reset only the measured checkout; do not reset other worktrees or user caches.
Record exit status, output, and cache labels. Do not accept failed or cached
runs as uncached timing samples. Repeat five times per revision under the same
conditions, with no competing validation. Keep Vite cache warmth explicit.

## Separate unit configuration experiments

Each variant ran five times on identical modified source, with its own external
Vite cache directory: cold first, then four warm repetitions. Every pass had
133 files, 1,439 passing tests, and the same two intentional skips. The named
unit wrapper, fork isolation, selectors, assertions, and real Nx cache probes
were retained.

| Variant        | Workers | Effect optimizer | Wall median (s) | Range (s)     |
| -------------- | ------: | ---------------- | --------------: | ------------- |
| Workers only   |       2 | Off              |          69.704 | 69.355–70.008 |
| Optimizer only |       1 | On               |          90.536 | 90.229–91.114 |
| Combined       |       2 | On               |          60.725 | 60.038–61.844 |

At two workers, optimization saved 12.88%; with optimization enabled, two
workers saved 32.93% versus one. These are conditional contrasts, not a full
factorial experiment: no same-source one-worker/optimizer-off control was run.
The fixed variant order and OS-cache state also limit causal precision.
Do not present these unit-only numbers as full-suite results.

To reproduce a variant, derive a temporary `.mts` config from the actual root
config, overriding only `test.maxWorkers`,
`test.deps.optimizer.ssr.enabled`, and a unique top-level `cacheDir`. Keep
`include: ["effect", "effect/testing"]` and all other inherited settings.
Invoke the named alias with `pnpm run test:unit --config /absolute/config.mts`.
Do not supply a global Nx cache-bypass flag.

## Code size and preservation

The fixed scope counts tracked and intended new `.ts`, `.tsx`, `.js`, `.mjs`,
`.cjs`, `.cts`, and `.mts` files, including declarations, comments, hidden
folders, and generated code. JSON, docs, snapshots, and `.ts.fixture` files
remain excluded. New helpers and the moved contract are included, so relocation
is not claimed as a saving.

| Metric         | Baseline | Modified |      Net removed |
| -------------- | -------: | -------: | ---------------: |
| Files          |      501 |      504 |                — |
| Physical lines |   84,754 |   84,395 | **359 / 0.424%** |
| Nonblank lines |   78,566 |   78,228 | **338 / 0.430%** |

After the separately approved CI-policy checks, the latest working tree still
has 504 code files, now 84,486 physical / 78,316 nonblank lines. Its total net
reduction from baseline is **268 physical (0.316%) / 250 nonblank (0.318%)**.
The earlier 359-line result describes the benchmarked optimization pass, not
savings from deleting Node 26 CI coverage.

For the measured optimization pass, the 30% physical-line target requires 25,427 net lines; this pass is 25,068
lines short. Larger estimates are documented in
[code-reduction opportunities](code-reduction-opportunities.md), not counted
as achievements. No generated runtime was deleted or privately patched.

Expanded inventories were collected through `report:test-lanes` before and
after. All 30 lane/runtime/credential/artifact metadata entries, every original
file/full-name multiset, and skip state were preserved. Unit identities rose
from 1,393 to 1,439; release-unit from 1,396 to 1,442. Contract (46), stdio
(55), CLI (82), mocked MCP (109), Worker HTTP (11), Workerd (2), and performance
(1) identities are unchanged. Duplicate executions with distinct lane
contracts were intentionally retained.

## Remaining opportunities

1. Profile the roughly 75 seconds outside the unit lane: build/pack candidate
   production, process startup, and lane imports. Reuse work only after proving
   identical inputs, runtime, package artifacts, and readiness semantics.
2. Continue narrow fixture/registration cleanup from the reviewed opportunity
   list, preserving raw expanded names and independent expected values. The
   audit's 3,900–6,500-line estimate is not validated savings and still cannot
   justify a 30% overall reduction.
3. Re-measure on hosted Node 24/26 runners before changing worker caps further.
   Broader SDK/Zod prebundling needs explicit nested-mock and module-identity
   evidence; threads remain unsafe for tests using `process.chdir()`.
4. Keep generator replacement as a separate architectural proposal. The
   installed plugin has no supported omit-runtime switch; even its larger
   estimated reduction is before replacement-code costs and far below 30%.

## Validation and limitations

Passed locally on Node 24:

- Focused client/Effect/core/node/cache checks and Worker/Operations checks.
- Full unit suite with CI coverage and JUnit output: 133 files, 1,439 passed,
  two existing generated-check skips. Standalone generated verification passed.
- Five serialized full PR passes plus uncached normal scheduling; package
  smoke, CLI packaging, publint, contract, stdio, Workerd, mocked MCP, and all
  11 HTTP cases passed.
- `check`, `check:types`, `check:boundaries`, `check:control-plane`,
  `check:server-manifest`, build, and Changeset validation. The commit-only
  package check was additionally evaluated using its existing pure function
  against the actual uncommitted diff: three changed workspaces and the full
  six-package release cascade were covered.
- Mocked performance: all five scenarios, completed iteration counts, response
  correlation, fixture verification, and cleanup passed. No live network/data
  was used. Startup p95 was 1.210 seconds; tools/list p95 8.848 ms;
  representative read p95 30.608 ms. These are informational, not a separate
  before/after latency claim.
- Worker build/dry-run and unresolved-private-import bundle check passed;
  **no deployment occurred**.

| Coverage   | Baseline (%) | Final (%) | Unchanged threshold (%) |
| ---------- | -----------: | --------: | ----------------------: |
| Statements |        82.97 |     82.99 |                      82 |
| Branches   |        76.84 |     76.81 |                      76 |
| Functions  |        86.38 |     86.57 |                      85 |
| Lines      |        84.48 |     84.51 |                      84 |

The small branch percentage change is reported rather than hidden; fixtures
and registration changed the denominator/observations, not scenarios,
assertions, exclusions, or thresholds.

For the measured optimization revision, Node 26, hosted CI, Docker, and
credential-gated live lanes were not executed locally. The later, explicitly
approved CI follow-up retains Node 26 in a scheduled/manual compatibility
workflow rather than the required PR matrix; see [test lanes](test-lanes.md#ci-runtime-policy). Lefthook installation
was blocked by an existing `pre-push.old`; existing hooks were preserved, not
removed or bypassed. At measurement time, no commits, pushes, publishes, or deployments occurred.

The private native/generated transport seam still has one compatibility
assertion for the SDK's richer client type; generated wrappers must continue
only invoking the native callable and consuming its data/status. Existing
routine envelope/flat/empty behavior and Promise-versus-Effect error semantics
are preserved. Broader dependency optimization, lane consolidation, or custom
generation requires new equivalence evidence rather than a percentage quota.
