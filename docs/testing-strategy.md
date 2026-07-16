# New Testing Strategy for hevy-mcp

## Executive summary

`hevy-mcp` already has substantial testing foundations: a fast Vitest suite,
V8 coverage uploaded to Codecov, mocked MCP client/server tests backed by Nock,
live read-only Hevy canaries, and process-level nightly checks for `npx`, `bunx`,
and the built source. The next step is not a framework replacement. It is to
turn these useful but partly independent tests into named lanes with explicit
contracts, ownership, coverage accounting, and release responsibilities.

This strategy keeps Vitest, Nock, the MCP TypeScript SDK, and generated Kubb
clients. It adds a systematic MCP contract matrix, a deterministic built and
packed-package boundary, production-schema reuse in live canaries, an honest
coverage denominator followed by a ratchet, and local performance trend tests.
Live Hevy tests remain read-only and credential-gated; deterministic pull
request lanes must never receive the Hevy API secret.

The intended result is a test pyramid that answers distinct questions:

1. Is the source statically valid and buildable?
2. Are individual decisions correct?
3. Does the complete MCP server contract work with deterministic HTTP inputs?
4. Does the built and packed stdio program behave like the distributed package?
5. Does the current Hevy API still satisfy the assumptions owned by this
   repository?
6. Are latency, concurrency, and stability moving in the wrong direction?

## Scope and non-goals

### In scope

- Test architecture, naming, commands, CI lanes, and release gates.
- Unit, component, mocked HTTP, in-memory MCP, spawned stdio, packed package,
  live Hevy canary, and local performance testing.
- MCP tool, prompt, resource, transport, lifecycle, and capability contracts.
- Output-schema ownership and upstream Hevy API drift detection.
- Coverage denominator, baseline, ratchet, and patch policy.
- Fixtures, fakes, Nock conventions, diagnostics, redaction, and flake policy.
- A phased, independently mergeable implementation backlog.

### Non-goals

- Replacing Vitest with Jest.
- Editing or unit-testing every line of generated Kubb code.
- Running write operations or load tests against the live Hevy API.
- Making live Hevy calls a pull request requirement.
- Treating the nightly suite as exhaustive coverage of every tool behavior.
- Introducing Pact without provider-side verification by Hevy.
- Setting arbitrary repository-wide coverage thresholds before measuring all
  intended production source.
- Changing the supported Node.js range in this document. Runtime declarations
  are inconsistent and require an explicit compatibility decision.

## Audit record and measured baseline

### Method

The audit inspected test files, production registrations, package scripts,
Vitest and Codecov configuration, GitHub Actions workflows, merged foundation
work, and the July 10 nightly failure. Commands were run without a Hevy API key,
so no live Hevy calls were made.

- Audit date: **July 10, 2026**.
- Measurement snapshot: **`09859b1672e5408b8ca8d65dd4bb7b2c35a8dd03`**.
- Current document base after fetching `origin/main`:
  **`a5095940cdd3c0243a4d86f5ef75c58b3956b2d9`**.
- Limitation: live test design, workflow history, and artifacts were inspected,
  but live behavior was not re-executed during this documentation change.

### Baseline measurements

At the measurement snapshot:

| Lane                       |                  Files/tests |  Lines | Branches | Functions |
| -------------------------- | ---------------------------: | -----: | -------: | --------: |
| Non-integration Vitest run | 32 files / 495 passing tests | 96.65% |   90.63% |    91.98% |
| Mocked MCP integration     |   2 files / 16 passing tests | 54.38% |   32.61% |    56.54% |

The percentages are **separate reports**, not one combined test-lane score.
They describe files imported by each run. `vitest.config.ts` does not currently
set an explicit `coverage.include` or equivalent all-production-source policy,
so unimported production files may be absent from the denominator. Generated
code is excluded by `codecov.yml`, which is appropriate, but the remaining
denominator is still incomplete until it is explicitly defined.

The current base may contain more tests than the recorded measurement because
`origin/main` advanced during the audit. The baseline above remains the
reproducible starting measurement for this strategy; the coverage ticket must
record a new merged-main baseline after fixing the denominator.

## Current architecture inventory and strengths

| Area                   | Current evidence                                     | Strength to preserve                                                                                    |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Test runner            | `vitest.config.ts`, `package.json`                   | Fast TypeScript-native Vitest suite with V8 coverage.                                                   |
| Unit/component tests   | `src/**/*.test.ts`, `tests/unit/`                    | Broad coverage of tools, utilities, schemas, CLI behavior, telemetry, shutdown, and manifests.          |
| Mocked MCP integration | `tests/integration/mocked/`                          | Real SDK `Client`, `McpServer`, and `InMemoryTransport` with Nock at the Axios HTTP seam.               |
| Live Vitest canary     | `tests/integration/hevy-mcp.integration.test.ts`     | Read-only validation against the real API, skipped without `HEVY_API_KEY`.                              |
| Process-level nightly  | `tests/nightly/test_hevy_mcp.mjs`                    | Real stdio JSON-RPC against `npx`, `bunx`, and built source.                                            |
| Release checks         | `.github/workflows/release.yml`                      | Unit, live integration, source stdio, and non-blocking Worker HTTP smoke test run before publishing.    |
| CI runtime matrix      | `.github/workflows/build-and-test.yml`               | Node 24 and 26 build, type, style, unit, and mocked integration checks.                                 |
| Docker smoke           | `.github/workflows/build-and-test.yml`, `Dockerfile` | Image build plus unauthenticated `--version` and `--help` smoke checks.                                 |
| Coverage               | `vitest.config.ts`, `codecov.yml`                    | V8/LCOV reports, Codecov project comparison, patch status, generated-code exclusion.                    |
| Response contracts     | `src/utils/response-formatter.ts`                    | Co-located Zod output schemas, raw-to-public formatting, legacy text projection, and response assembly. |
| Prompts/resources      | `src/prompts/`, `src/resources/`                     | Dedicated registrations and focused tests; resource calls also have mocked MCP coverage.                |
| SDK-sensitive stdio    | `src/utils/stdio-observability.ts` and its tests     | Private SDK access is isolated and has focused buffering/protocol regression tests.                     |

This strategy builds on completed work rather than restarting it:

- [#382](https://github.com/chrisdoc/hevy-mcp/pull/382) expanded live
  read-only integration coverage.
- [#411](https://github.com/chrisdoc/hevy-mcp/issues/411) and
  [#439](https://github.com/chrisdoc/hevy-mcp/pull/439) established mocked MCP
  integration with Nock in deterministic CI.
- [#413](https://github.com/chrisdoc/hevy-mcp/issues/413) and
  [#437](https://github.com/chrisdoc/hevy-mcp/pull/437) hardened SDK-private
  stdio observability behavior.
- [#422](https://github.com/chrisdoc/hevy-mcp/issues/422) and
  [#426](https://github.com/chrisdoc/hevy-mcp/pull/426) added `bunx` nightly
  coverage.
- [#495](https://github.com/chrisdoc/hevy-mcp/issues/495) and
  [#512](https://github.com/chrisdoc/hevy-mcp/pull/512) added structured tool
  outputs and production output schemas.
- [#557](https://github.com/chrisdoc/hevy-mcp/issues/557) and
  [#572](https://github.com/chrisdoc/hevy-mcp/pull/572) added debug diagnostics,
  stderr discipline, and redaction tests.
- [#564](https://github.com/chrisdoc/hevy-mcp/issues/564) and
  [#574](https://github.com/chrisdoc/hevy-mcp/pull/574) added and validate the
  package/server manifest contract.
- [#585](https://github.com/chrisdoc/hevy-mcp/issues/585) and
  [#587](https://github.com/chrisdoc/hevy-mcp/pull/587) added built-source
  nightly and release validation.

## Evidence-based gaps and risks

| Severity | Gap/risk                                                                        | Evidence                                                                                                                                                  | Consequence                                                                                                                       |
| -------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Critical | Production output schemas and live canary schemas have separate ownership.      | Response contracts in `src/utils/response-formatter.ts`; test-local schemas in `tests/integration/hevy-mcp.integration.test.ts`; July 10 run and PR #594. | A live payload can satisfy a permissive canary assertion but fail SDK output validation, or tests can drift away from production. |
| High     | Mocked MCP coverage is representative, not a complete per-tool contract matrix. | Two files in `tests/integration/mocked/`; 23 advertised tools; 16 mocked tests at baseline.                                                               | Uncovered tools, invalid inputs, error classes, annotations, or output parity can regress in deterministic PR lanes.              |
| High     | Coverage excludes unimported files by default.                                  | `vitest.config.ts` has no explicit `coverage.include`; separate unit/mocked LCOV reports.                                                                 | A high percentage can coexist with untested production modules, making thresholds misleading.                                     |
| High     | No deterministic packed-tarball stdio boundary exists.                          | Nightly uses published `@latest` or built source; `prepack` exists, but no PR lane installs the exact `npm pack` artifact.                                | Packaging, `files`, shebang, exports, manifest, or dependency errors can escape source tests.                                     |
| High     | Runtime declarations disagree.                                                  | `.nvmrc` is 24; CI tests 24/26; `AGENTS.md` says >=24; `package.json` says >=20.                                                                          | Users may run an allowed but untested runtime, or maintainers may unintentionally break a claimed support range.                  |
| Medium   | MCP process and lifecycle coverage is selective.                                | In-memory calls and nightly smoke exist; no central matrix for capability negotiation, close behavior, invalid protocol calls, or list notifications.     | SDK upgrades or registration changes can break protocol behavior beyond successful tool calls.                                    |
| Medium   | Stateful and sequence behavior lacks a contract suite.                          | Exercise-template cache and utilities have unit tests, but no systematic multi-call MCP scenarios.                                                        | Cache isolation, invalidation, repeated calls, and concurrent calls may corrupt state or leak between clients.                    |
| Medium   | Upstream drift review is not a named workflow.                                  | `openapi-spec.json`, generated `src/generated/`, and live canaries exist without a committed diff/fixture policy.                                         | Hevy changes can be noticed late or reviewed as noisy generated output without explicit contract implications.                    |
| Medium   | Diagnostics can expose excessive upstream detail.                               | July 10 failed logs included a large Axios/request dump; debug/redaction foundations exist in `src/utils/debug.test.ts`.                                  | Secrets, user data, headers, or noisy internals can appear in CI artifacts and slow diagnosis.                                    |
| Medium   | No performance history or concurrency lane.                                     | No benchmark/performance scripts or trend artifact in `package.json` and workflows.                                                                       | Regressions in startup, list calls, mocked reads, or resource usage are detected only by users.                                   |
| Low      | Test commands do not express a stable taxonomy.                                 | CI invokes long Vitest commands directly; `package.json` has only broad `test`.                                                                           | Local and CI behavior can diverge, and ownership/onboarding remain unclear.                                                       |

### July 10 `get-workout-events` example

On **July 10, 2026 at 19:01 UTC**, nightly run
[`29116591988`](https://github.com/chrisdoc/hevy-mcp/actions/runs/29116591988)
failed all three launcher jobs at `get-workout-events-shape`. The SDK reported
MCP error `-32602` because structured content did not match the declared output
schema; live event workouts included properties not accepted by the schema.

Merged [PR #594](https://github.com/chrisdoc/hevy-mcp/pull/594) normalized updated
and deleted events into the repository-owned formatted shape and added focused
tests. This is evidence that representative mocks and duplicated schemas left a
detection gap. It is **not** evidence that current `main` still has the defect;
current `main` includes the fix.

## Decisions and tradeoffs

1. **Keep Vitest rather than migrate to Jest.** Vitest is already fast, typed,
   integrated with V8 coverage, and used throughout the repository. A migration
   would consume effort without closing the identified contract gaps.
2. **Retain Nock while Axios is the HTTP seam.** Nock validates real outbound
   HTTP requests, headers, paths, and query strings without changing production
   code. Reconsider only if the production transport leaves Node HTTP/Axios.
3. **Use custom fakes for unit tests.** Small typed fakes are preferred when a
   unit only needs a deterministic return value or call record; Nock belongs at
   HTTP/component boundaries, not every unit test.
4. **Combine in-memory MCP and spawned stdio/package tests.** In-memory tests are
   fast and diagnostic. Spawned tests validate build, process, framing, stdout,
   shutdown, and packaging. Neither substitutes for the other.
5. **Do not adopt Pact unless Hevy participates in provider verification.** A
   consumer-generated Pact file alone only records this repository's
   expectations. Without provider verification and result exchange, it cannot
   prove that Hevy still satisfies them; production schemas, fixtures, OpenAPI
   review, and live canaries provide more value now.
6. **Keep Kubb output generated and excluded.** Never hand-edit
   `src/generated/`. Test repository-owned adapters, formatters, and schemas;
   review regenerated diffs and smoke representative generated client calls.
7. **Keep live tests read-only and scheduled/manual/release.** They require an
   explicit secret-bearing environment, modest request volume, and diagnostic
   redaction. Secrets must not be available to deterministic PR lanes.
8. **Treat Node support as a decision, not an assumed bump.** Ticket TS-01 must
   align `.nvmrc`, CI, docs, Docker, and `engines` by either testing the wider
   range or narrowing the claim through a separately reviewed compatibility
   decision.

## MCP contract standard

The deterministic contract suite should maintain a machine-readable inventory
of every tool, resource, and prompt. For each applicable item it must validate:

### Tools

- Exact name, description presence, annotations, and stable inventory count.
- Valid `inputSchema` and, for structured tools, valid `outputSchema`.
- At least one valid minimal input and one meaningful boundary input.
- Text JSON and `structuredContent` semantic parity for successful structured
  responses, including empty and nullable results.
- Invalid calls: unknown tool, missing required fields, wrong types, invalid
  ranges, malformed timestamps, and unsupported extra fields where disallowed.
- Upstream error classes through MCP: authentication/authorization, not found,
  conflict or validation, rate limit, timeout/network, malformed upstream data,
  and 5xx. Assertions should target stable public error behavior, not entire
  Axios dumps.
- Read/write/idempotency annotations and non-retry behavior for mutations.

### Resources and prompts

- Inventory, metadata, URI/template shape, MIME type, valid read/get behavior,
  unknown identifiers, and error semantics.
- Prompt inventory, argument validation, deterministic rendered messages, and a
  process-level invocation where supported by the SDK client.

### Protocol and lifecycle

- Capability negotiation matches implemented features.
- `list_changed` notifications are emitted only when the corresponding
  capability is advertised and the list is actually dynamic. Static lists
  should not manufacture notifications.
- Initialize, repeated calls, explicit client/server close, child-process exit,
  EOF, and signal handling complete without hangs or orphan processes.
- Stdout contains only valid newline-delimited MCP JSON-RPC messages; all logs,
  warnings, debug data, and traces go to stderr.
- Stateful multi-call scenarios cover cache warm-up, repeated reads, invalidation
  where supported, cross-test/client isolation, concurrency, and cleanup.
- Every `@modelcontextprotocol/sdk` upgrade is gated by MCP contract, built stdio,
  and `src/utils/stdio-observability.test.ts` because that module intentionally
  isolates private SDK stdio internals.

## Data integrity and upstream drift strategy

1. **Production response contracts are the oracle.** Export reusable,
   repository-owned Zod output schemas from
   `src/utils/response-formatter.ts`, where raw-to-public normalization,
   legacy text projection, and response assembly are co-located. Use those
   schemas in mocked MCP, live Vitest, and spawned canary assertions. Tests
   should not maintain a second permissive definition of the same output.
2. **Use named fixtures.** Store sanitized fixtures by behavior, such as
   `workout-events.updated-with-extra-upstream-fields.json`, rather than generic
   `response.json`. Each fixture records source category, capture date, applied
   redactions, and the contract behavior it protects. Never commit API keys or
   identifying user data.
3. **Commit OpenAPI changes intentionally.** Changes to `openapi-spec.json` must
   include the regenerated Kubb diff from `npm run build:client`, a concise
   upstream-change summary, and tests for any repository-owned formatter/schema
   changes. Generated files remain reviewable output, not manual edit targets.
4. **Review generated client regeneration.** Review endpoint additions/removals,
   required/optional/nullability changes, enum changes, pagination, and response
   envelopes before accepting bulk generated diffs.
5. **Categorize live canaries.** Keep separate read-only checks for handshake and
   inventory, representative endpoint shape, pagination/count consistency,
   structured-output validation, and stable error classification. This makes
   failures actionable and controls API volume.
6. **Consumer-only Pact files are insufficient.** Pact becomes useful only when
   the provider replays and verifies the contract and shares verification
   results. Until Hevy participates, a Pact file would duplicate expectations
   without independently checking provider compatibility.

## Target layered architecture and test pyramid

| Layer                       | Purpose                                                    |                      Pull request                      |          Nightly/manual          |                      Release                       |
| --------------------------- | ---------------------------------------------------------- | :----------------------------------------------------: | :------------------------------: | :------------------------------------------------: |
| Static/build                | Format, lint, types, manifest, build, changeset            |              Required, Node policy matrix              | Optional scheduled compatibility |                      Required                      |
| Unit/component              | Pure logic, tools with fakes, schemas, errors, telemetry   |                        Required                        |                —                 |          Required through PR/main result           |
| Mocked HTTP + in-memory MCP | Complete deterministic MCP contract over Nock              |                  Required, no secrets                  |    Optional diagnostic rerun     |          Required through PR/main result           |
| Built stdio                 | Spawn `dist/cli.mjs`; protocol purity and lifecycle        |                Required on primary Node                |  Optional compatibility matrix   |                      Required                      |
| Packed tarball smoke        | `npm pack`, install tarball, spawn binary, inspect package |                Required on primary Node                |  Optional npm/Bun compatibility  |                      Required                      |
| Live Hevy canary            | Read-only provider drift and credentialed behavior         |             Never in deterministic PR lane             |       Scheduled and manual       | Required before publish for selected source checks |
| Performance trend           | Mocked startup, latency, concurrency, sequential stability | Record initially; gate only regressions after baseline |          Trend artifact          |             Informational until stable             |

The live suite complements deterministic tests; it must not compensate for
missing mocks. The packed tarball lane validates the candidate artifact, while
the nightly `npx`/`bunx @latest` checks validate the currently published one.

## Named package scripts

TS-06 implements the stable public script names below. The exact selectors,
lane ownership, deterministic/live boundaries, and current downstream scope are
documented in [`docs/test-lanes.md`](./test-lanes.md). CI and contributors use
these names rather than duplicating selectors:

```json
{
	"test:unit": "vitest run --exclude 'tests/integration/**' --exclude 'tests/performance/**'",
	"test:mcp": "vitest run tests/integration/mocked",
	"test:contract": "vitest run <current contract baseline>",
	"test:stdio": "vitest run <current stdio/process baseline>",
	"test:pack": "node tests/package/npm-pack-smoke.mjs",
	"test:live": "node --env-file-if-exists=.env scripts/run-live-tests.mjs",
	"test:nightly": "node --env-file-if-exists=.env tests/nightly/test_hevy_mcp.mjs",
	"test:performance": "npm run build && vitest run tests/performance/performance.test.ts",
	"test:coverage": "unit and mocked MCP coverage via their named lanes",
	"test:pr": "npm run test:unit && npm run test:mcp && npm run test:contract && npm run test:stdio && npm run test:pack"
}
```

`test:live` and `test:nightly` must fail fast with a clear message when they are
explicitly invoked without required credentials. They should not silently turn
an intentional live job into a skipped success.

## CI gate matrix

| Gate                    | Node/runtime                                     | Secret                                     | Blocking policy                     | Artifact/diagnostic                         |
| ----------------------- | ------------------------------------------------ | ------------------------------------------ | ----------------------------------- | ------------------------------------------- |
| Static/build            | Runtime policy matrix, currently 24/26           | None                                       | Blocking PR                         | Build and concise logs                      |
| Unit + coverage         | Primary Node, currently 24                       | None                                       | Blocking PR                         | JUnit + unit LCOV                           |
| Unit compatibility      | Additional supported/tested Nodes                | None                                       | Blocking PR                         | Concise log                                 |
| Mocked MCP contract     | Primary + compatibility Nodes                    | None                                       | Blocking PR                         | JUnit + mocked LCOV                         |
| Built stdio             | Primary Node                                     | None; child-scoped loopback fixture server | Blocking PR                         | Redacted stderr on failure                  |
| Packed npm tarball      | Primary Node; add Bun only if support is claimed | None; child-scoped loopback fixture server | Blocking PR                         | Tarball file list, size, binary result      |
| Performance trend       | Primary Node, stable hosted runner class         | None                                       | Non-gating for first 2–4 weeks      | JSON summary + history artifact             |
| Live source canary      | `.nvmrc` Node                                    | `HEVY_API_KEY`                             | Nightly/manual and release blocking | Redacted category summary                   |
| Published package smoke | `npx` and `bunx`                                 | `HEVY_API_KEY`                             | Nightly blocking/alerting           | Package version, launcher, category summary |

The current build workflow defines `HEVY_API_KEY` at workflow scope, so every
job and step can inherit it even though the PR workflow runs deterministic
mocked integration rather than live integration. Early work must remove this
workflow/job/step inheritance from deterministic lanes. Credentials should
exist only on explicitly credentialed live/manual/nightly/release jobs, never
as ambient workflow configuration for PR tests.

## Coverage policy

### Step 1: fix the denominator

- Define `coverage.include` for repository-owned production TypeScript, for
  example `src/**/*.ts`.
- Explicitly exclude generated Kubb files, test files, declarations, and any
  intentionally non-runtime build configuration.
- Decide whether CLI bootstrap modules belong in the unit report, stdio report,
  or a merged report, but ensure they appear in the total denominator.
- Give unit, MCP, and stdio reports Codecov flags or otherwise merge them in a
  reproducible way without double-counting ambiguity.

### Step 2: record the merged-main baseline

Land the denominator change without arbitrary failure thresholds, run it on
merged `main`, and record lines, functions, statements, branches, and uncovered
risk areas. A percentage from the old imported-files-only denominator must not
be used as the new floor.

### Step 3: ratchet

- Block unexplained project coverage regression relative to the validated base.
- Require **>=90% patch coverage** after the denominator and Codecov report merge
  are stable.
- Raise repository thresholds gradually as gap tickets land.
- Do not reward low-value assertion volume solely to increase percentages.

### Adoption target after baseline validation

The proposed steady-state target is `>=85%` lines, functions, and statements;
`>=75%` branches; and `>=90%` patch coverage. These values become policy only
after the all-source baseline is measured and the team agrees they are
achievable without excluding difficult production code.

Risk-heavy modules should have stronger behavioral expectations than the global
percentage: `src/index.ts`, `src/cli.ts`, `src/utils/hevyClientKubb.ts`,
`src/utils/error-handler.ts`, `src/utils/response-formatter.ts`,
`src/utils/stdio-observability.ts`, cache/catalog behavior, and every mutation
tool. Critical branch/error behavior should be enumerated even when aggregate
coverage is already high.

## Mocking, fixtures, and test-support conventions

- Prefer typed factory functions with valid defaults and explicit overrides.
- Keep shared MCP harness code under a dedicated test-support path, not in
  production exports.
- The harness owns `Client`, `McpServer`, `InMemoryTransport`, registration,
  connect/close, cache reset, `nock.disableNetConnect()`, interceptor completion,
  and concise response parsing.
- Nock scopes must assert method, path, query, required headers, and expected
  call count. Tests must fail on unused interceptors and unexpected network.
- Use custom fakes for narrow unit dependencies and Nock for Axios/HTTP behavior.
- Parent-process Nock cannot intercept HTTP from a spawned package. Spawned
  stdio/package tests must instead use a subprocess-compatible fixture server
  bound to loopback, with a safe launch/configuration seam applied only to the
  test child process. The harness must prove that non-fixture and live hosts are
  unreachable. This does not imply a production-wide insecure endpoint
  override.
- Use fake timers only for deterministic retry/backoff logic; do not mix fake
  timers with spawned-process timing tests.
- Keep one named fixture per meaningful upstream shape. Do not create giant
  catch-all fixture dumps.
- Redact IDs, names, notes, URLs, tokens, headers, trace metadata, and other user
  content before committing fixtures.
- Assertions should target public behavior and schemas, not generated
  implementation details or complete unstable error strings.

## Flake policy

- Every flaky test has an owner, tracking issue, first-seen date, observed rate,
  and evidence artifact.
- Quarantine is time-boxed and visible; it moves a test to a non-blocking lane
  only when the test itself is nondeterministic, not when the product is flaky.
- No blind retries. A retry is allowed only when it models an intentional
  production retry policy or temporarily measures a known external flake.
- CI test reruns must preserve the first failure and report whether the rerun
  passed; a rerun must not erase the original signal.
- Deterministic tests should control time, randomness, ports, environment,
  network, and cleanup. Live canaries should classify provider, network,
  authentication, schema, and product failures separately.
- A quarantined test must be fixed, replaced, or removed by its expiry date.

## Nightly environment, diagnostics, and redaction

- Pin the Node version through `.nvmrc`; report Node, npm/Bun, launcher, package
  version, source SHA, protocol version, and test category.
- Use a dedicated least-privilege Hevy test account and read-only scenarios.
- Set explicit per-call and whole-suite timeouts and cap pagination/request count.
- Emit one concise result per category plus a final summary. Upload a structured
  JSON artifact for trend/debug data.
- Stdout from the server remains protocol-only. Harness diagnostics and server
  logs are captured separately from JSON-RPC messages.
- Redact API keys, authorization and API-key headers, user IDs, workout/routine
  IDs, names, notes, URLs, request bodies, trace baggage, and Axios request
  internals. Prefer status, endpoint category, error class, request ID hash, and
  schema path.
- Add regression tests that feed representative Axios/MCP errors into diagnostic
  formatting and assert forbidden values never appear.
- Retain failure artifacts only as long as needed for diagnosis and according to
  repository/security policy.

## Local mocked performance methodology

Performance tests build first, then spawn `dist/cli.mjs` over MCP stdio with a
child-local preload that installs deterministic Nock fixtures and blocks both
Node HTTP(S) and `fetch`. The child reports exact fixture use through a prefixed,
machine-readable stderr marker. Record configured/completed iterations, median,
p95, maximum, correctness failures, exact fixture verification, and server
process RSS (with a nullable non-Linux fallback); label runner memory separately.
Exclude dependency installation and build time from request latency.

Initial **non-gating** targets:

- Startup plus MCP initialize p95: **<2 seconds**.
- `tools/list` p95: **<100 ms**.
- Representative mocked read tool p95: **<500 ms**.
- **20 concurrent calls** complete with correct correlation, content, and errors.
- **100 sequential calls** complete without state corruption, leaked Nock
  interceptors, orphan processes, or sustained memory growth indicating a leak.

Timing becomes a hard gate only after **2–4 weeks** of baseline data establish
runner variance and a regression budget. Correctness under concurrency can gate
earlier. Live API load tests are prohibited: live checks remain low-volume
canaries and must not benchmark Hevy.

## Phased roadmap and dependency ordering

### Phase 1: align and standardize

1. Decide runtime support and align declarations (TS-01).
2. Build the reusable deterministic MCP/Nock harness (TS-02).

### Phase 2: close contract drift

3. Build the complete MCP contract matrix on the shared harness (TS-03).
4. Reuse production output schemas in live canaries (TS-04).

### Phase 3: validate distribution boundaries

5. Add built stdio and deterministic packed-tarball validation (TS-05).
6. Add stable script names and local performance baseline collection (TS-06).

### Phase 4: enforce honest quality gates

7. Fix the coverage denominator, measure, then ratchet (TS-07).
8. Harden nightly diagnostics and add redaction regression tests (TS-08).

These phases are sequencing guidance, not blanket hard prerequisites. Tickets
without a listed hard dependency can merge in any order; where practical they
should expose stable helpers that later tickets may reuse without waiting for
the entire phase. The suggested order avoids setting final coverage gates
before likely harness/process code is visible in the denominator and reduces
duplicated contract logic across live and mocked suites.

## Proposed independently mergeable implementation tickets

### TS-01 — Align Node/runtime declarations

- **Tracking issue:** [TS-01 — Align Node/runtime declarations](https://github.com/chrisdoc/hevy-mcp/issues/605).
- **Objective:** Make the claimed support range match tested and distributed
  runtimes.
- **Scope:** Inventory `.nvmrc`, `package.json#engines`, README, `AGENTS.md`, CI,
  Docker, release, and Bun claims; decide whether to test Node 20–23 or narrow
  the declared range; update declarations and compatibility tests accordingly.
- **Dependencies:** None.
- **Acceptance criteria:**
  - A documented support decision is approved.
  - Runtime declarations and CI jobs no longer contradict one another.
  - Every claimed Node major has an explicit validation level.
  - No version bump is implied without compatibility evidence and review.

### TS-02 — Shared mocked MCP/Nock harness

- **Tracking issue:** [TS-02 — Shared mocked MCP/Nock harness](https://github.com/chrisdoc/hevy-mcp/issues/606).
- **Objective:** Remove duplicated client/server/Nock lifecycle setup and make
  deterministic MCP tests safe by default.
- **Scope:** Typed test-support factories; registration; linked transport;
  connect/close; cache reset; disabled external network; interceptor checks;
  text/structured response helpers; named fixture factories; and removal of
  workflow/job/step `HEVY_API_KEY` inheritance from deterministic PR lanes.
- **Dependencies:** None. The harness can use the repository's current primary
  runtime while TS-01 resolves the longer-term support declaration.
- **Acceptance criteria:**
  - Both existing mocked MCP files use the shared harness.
  - Unexpected network, unused interceptors, leaked clients/servers, and cache
    leakage fail tests.
  - Existing 16 mocked tests remain behaviorally equivalent and passing.
  - Test support is not exported as production package API.
  - Deterministic PR jobs and steps cannot inherit `HEVY_API_KEY` or other live
    credentials from workflow or job scope.
  - Credentials are configured only on explicitly credentialed
    live/manual/nightly/release jobs.

### TS-03 — Full MCP tool contract matrix

- **Tracking issue:** [TS-03 — Full MCP tool contract matrix](https://github.com/chrisdoc/hevy-mcp/issues/607).
- **Objective:** Deterministically validate the public MCP contract for every
  registered tool, plus prompts/resources and lifecycle behavior.
- **Scope:** Inventory/metadata; valid schemas; success, empty/null, invalid
  input, upstream error classes; text/structured parity; capabilities;
  notifications; resources/prompts; close; multi-call/cache; stdout purity where
  process coverage is available.
- **Dependencies:** TS-02 is a hard dependency if the matrix is implemented on
  the shared harness; inventory and case design may proceed before it lands.
- **Acceptance criteria:**
  - Every advertised tool has a tracked row with required contract cases.
  - Every structured read validates its production output schema and text parity.
  - Every mutation has success, validation, and non-retry/error coverage.
  - Resources, prompts, capability negotiation, lifecycle, and stateful calls
    have explicit deterministic cases.
  - Adding a new registration without a matrix entry fails CI.

### TS-04 — Reuse production schemas in live canaries

- **Tracking issue:** [TS-04 — Reuse production schemas in live canaries](https://github.com/chrisdoc/hevy-mcp/issues/608).
- **Objective:** Eliminate duplicate live-test output contracts.
- **Scope:** Export/import production output schemas; validate
  `structuredContent`; retain text compatibility assertions; add named sanitized
  fixtures beginning with workout events; categorize live canaries.
- **Dependencies:** None. It may optionally reuse TS-02 response helpers, but
  production schema reuse and sanitized live fixtures can land independently.
- **Acceptance criteria:**
  - Live tests no longer define competing schemas for production outputs.
  - Representative live reads validate production schemas and text parity.
  - Updated/deleted workout-event fixtures reproduce the #594 class of failure.
  - Live suite stays read-only and skips only in non-live contexts; an explicit
    live job without credentials fails clearly.

### TS-05 — Deterministic npm-pack + spawned-stdio boundary

- **Tracking issue:** [TS-05 — Deterministic npm-pack + spawned-stdio boundary](https://github.com/chrisdoc/hevy-mcp/issues/609).
- **Objective:** Test the exact candidate package and real stdio framing before
  merge/release without contacting Hevy.
- **Scope:** Build; `npm pack`; inspect tarball contents; install in a temporary
  project; spawn the packaged binary; initialize/list/call/close against a
  subprocess-compatible loopback fixture server; provide a safe
  launch/configuration seam scoped to the test child process; assert stdout
  purity, stderr separation, shebang/exports/manifests, and process cleanup;
  preserve the existing Docker image build and unauthenticated `--version` and
  `--help` smoke checks.
- **Dependencies:** None. It may reuse TS-02/TS-03 fixtures or helpers, but must
  not require them to validate the package boundary.
- **Acceptance criteria:**
  - PR CI installs and executes the generated tarball, not the source tree.
  - No live secret is available, and non-fixture/live hosts are provably
    unreachable from the child process.
  - The implementation records whether image-level MCP stdio coverage is part
    of this ticket or a named follow-up; the current Docker build and
    unauthenticated `--version`/`--help` lane remains blocking either way.
  - Initialization, inventory, representative call, error call, and close pass.
  - Package file list, binary entry, `server.json`, and version metadata are
    asserted.
  - Non-MCP stdout and orphan child processes fail the lane.

### TS-06 — Named test lanes + local performance baseline

- **Tracking issue:** [TS-06 — Named test lanes + local performance baseline](https://github.com/chrisdoc/hevy-mcp/issues/610).
- **Objective:** Give contributors stable commands and establish performance
  trend data without premature timing gates.
- **Scope:** Add the proposed scripts; document lane ownership; add startup,
  `tools/list`, mocked read, 20-concurrent, and 100-sequential measurements;
  publish JSON summaries.
- **Dependencies:** None. Stable script names and baseline collection can land
  against current tests; later tickets can adopt the names and optional shared
  performance helpers.
- **Acceptance criteria:**
  - Local and CI use the same named scripts.
  - Performance results include environment, configured/completed iterations,
    p50/p95/max, fixture verification, failures, and server memory observations.
  - Initial non-gating targets are reported for 2–4 weeks.
  - Correctness failures gate immediately; timing gates remain informational
    until variance is reviewed.
  - No live Hevy load/performance calls are introduced.

### TS-07 — Honest coverage denominator + ratchet

- **Tracking issue:** [TS-07 — Honest coverage denominator + ratchet](https://github.com/chrisdoc/hevy-mcp/issues/611).
- **Objective:** Make coverage percentages represent all intended
  repository-owned production source, then prevent regression.
- **Scope:** Add explicit include/exclude policy; merge or flag unit/MCP/stdio
  reports; record merged-main baseline; configure project and patch policy;
  enumerate stronger expectations for risk-heavy modules.
- **Dependencies:** TS-06 for stable lane names and reproducible report
  composition. TS-03 and TS-05 are not hard dependencies; their code must enter
  the denominator when they land, and the baseline/ratchet can be refreshed.
- **Acceptance criteria:**
  - Every intended production file appears covered or uncovered in a report.
  - Generated Kubb code remains explicitly excluded.
  - A merged-main baseline is committed to project documentation.
  - Ratchet policy blocks unexplained regression.
  - The >=85% lines/functions/statements, >=75% branches, and >=90% patch target
    is adopted only after baseline review, with an approved transition plan if
    the baseline is lower.

### TS-08 — Nightly diagnostics redaction regression tests

- **Tracking issue:** [TS-08 — Nightly diagnostics redaction regression tests](https://github.com/chrisdoc/hevy-mcp/issues/612).
- **Objective:** Make live failures actionable without leaking credentials or
  user/upstream payload detail.
- **Scope:** Structured category results; environment/version metadata;
  classification; concise schema paths; Axios/MCP error normalization;
  forbidden-value redaction tests; artifact retention guidance.
- **Dependencies:** None. It may optionally reuse TS-04 schema categorization
  and TS-06 lane names, but redaction normalization and regression fixtures can
  land independently.
- **Acceptance criteria:**
  - Regression fixtures include API-key headers, user data, IDs, URLs, request
    bodies, trace metadata, and large Axios error objects.
  - Tests prove forbidden values do not appear in console or uploaded summaries.
  - Nightly summaries identify launcher, package/source version, category, error
    class, and schema path without dumping full payloads.
  - Redaction failure blocks CI.

The implemented nightly artifact is one JSON file per launcher. It contains
only allowlisted launcher/runtime/version metadata, categorized pass/fail
results, normalized error classes, concise schema paths, totals, and bounded
stderr-observation metadata. It never contains raw stderr, commands or
arguments, error messages/stacks/causes, URLs, IDs, headers, request/response or
MCP payloads, trace data, or user data. Nightly workflow artifacts are retained
for **7 days**; raw logs or stderr payloads must not be uploaded alongside them.
The source revision is populated only for source-build launchers; registry
launchers rely on the package/server version reported by the connected server.

## Definition of done

The strategy is implemented when:

- Runtime declarations and tested support agree.
- Stable named scripts exist for every test layer.
- Every MCP tool has deterministic contract coverage, with prompts/resources and
  lifecycle/capability behavior also covered.
- Production output schemas are shared by mocked and live assertions.
- Pull requests validate built stdio and the exact `npm pack` artifact without
  secrets or live network.
- Live tests are read-only, categorized, scheduled/manual/release-only, and
  safely redacted.
- Coverage includes all intended repository-owned production source, records a
  reviewed baseline, and uses a ratchet plus patch policy.
- Performance and concurrency trends are recorded, with gates based on observed
  variance rather than arbitrary first-day timings.
- Flakes have owners and expiry; blind retries are absent.
- SDK upgrades explicitly run the stdio private-internals gate.

## 30/60/90-day success indicators

### 30 days

- TS-01 owns an approved runtime-support decision and aligned declarations.
- TS-02 owns removal of ambient `HEVY_API_KEY` inheritance from deterministic
  CI and runs the existing 16 mocked MCP tests on the shared harness with zero
  leaked network or transport resources.
- TS-03 owns a contract inventory listing 100% of current tools, prompts, and
  resources, even if some implementation rows are still pending.

### 60 days

- TS-03 owns 100% deterministic contract rows for advertised tools.
- TS-04 owns production-schema and text-parity assertions for structured live
  reads plus the sanitized workout-event regression fixture.
- TS-05 owns built-source and packed-tarball
  initialize/list/call/error/close coverage with zero non-protocol stdout
  incidents while preserving the Docker smoke lane.
- TS-06 owns stable documented commands for every lane and starts performance
  history collection no later than day 60.

### 90 days

- TS-06 owns at least 2–4 weeks of performance history, stable regression bands
  for startup/list/mocked reads, and consistently passing 20-concurrent and
  100-sequential correctness scenarios.
- TS-07 owns the published all-source baseline and ratchet; >=90% patch coverage
  is active or has an approved dated transition.
- TS-08 owns redacted nightly category diagnostics with no known secret/user
  data leaks.
- TS-08 owns flake reporting for deterministic blocking lanes below 1%, with
  every observed flake owned and time-boxed.

## Canonical references

- [Vitest coverage guide](https://vitest.dev/guide/coverage.html)
- [Vitest coverage configuration](https://vitest.dev/config/coverage.html)
- [MCP 2025-11-25 transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP 2025-11-25 lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
- [MCP 2025-11-25 tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [`npm pack` documentation](https://docs.npmjs.com/cli/v11/commands/npm-pack/)
- [Codecov status checks](https://docs.codecov.com/docs/commit-status)
- [Nock repository and documentation](https://github.com/nock/nock)
- [How Pact works](https://docs.pact.io/getting_started/how_pact_works)
- [Pact provider verification](https://docs.pact.io/provider)
