# Working in hevy-mcp

Use this file for agent decisions and project invariants. Read the relevant
source below for implementation details; do not copy changing tool versions,
command inventories, or release cascades into this file.

## Start with the task

1. Inspect `git status --short --branch` and `git worktree list`. Preserve
   unrelated changes and other checkouts.
2. For an existing branch or PR, continue there. For new implementation work,
   fetch the intended base (normally `origin/main`) and create a feature branch
   in an isolated worktree. Read-only work needs no branch or dependency install.
3. Read the applicable sources, then inspect the exact code involved. Install
   tools/dependencies only when execution requires them.
4. Complete authorized work through validation and a reviewable result. Carry
   forward the user's corrections and existing authorization. Ask only for
   missing information that blocks progress or an action outside that scope.

Never reset, discard, or overwrite user changes. If a conflict risks those
changes, stop and explain it. Never commit/push to `main` or force-push without
explicit authorization. Use Conventional Commits and keep Git hooks enabled;
investigate hook failures rather than bypassing them.

## Sources to consult

| Task                                                      | Source of truth                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Setup, Node policy, required checks, release policy       | [CONTRIBUTING.md](./CONTRIBUTING.md)                                                                                            |
| Commands and pinned development tools                     | [package.json](./package.json), [mise.toml](./mise.toml)                                                                        |
| Workspace ownership, allowed imports, release propagation | [repository/topology.json](./repository/topology.json)                                                                          |
| Test selection                                            | [docs/test-lanes.md](./docs/test-lanes.md), [repository/validation-lanes.json](./repository/validation-lanes.json)              |
| Node transports and lifecycle                             | [packages/node/README.md](./packages/node/README.md)                                                                            |
| Worker deployment, origins, authentication, OAuth         | Cloudflare Worker section of [CONTRIBUTING.md](./CONTRIBUTING.md)                                                               |
| Telemetry and collector integration                       | [docs/observability.md](./docs/observability.md), [Worker version attribution](./docs/cloudflare-worker-version-attribution.md) |
| Generated API client                                      | Generated API client section of [CONTRIBUTING.md](./CONTRIBUTING.md)                                                            |

Use mise's pinned Node, pnpm, and other tools for development commands:
`mise exec -- pnpm ...`, `mise exec -- node ...`, or `mise exec -- npx ...`.
Follow contributor setup and enable Lefthook in the working clone. Report
unavailable tooling; do not silently substitute system versions.

Prefer GitHub MCP for GitHub operations. Use an authenticated alternative such
as `gh` when the connector cannot perform the operation. If Git transport fails,
API publication may publish the validated commit without bypassing hooks or
required pre-push checks. Preserve the verified tree and commit where possible,
and update only the intended feature branch without forcing its ref.

## Discover code efficiently

Read exact named files directly. Use focused `rg` searches and batch independent
reads; expand the search when imports, generated code, or sibling adapters make
the initial result incomplete. Verify findings against source.

<!-- entire-graph:begin -->

Read [.entire/graph-agent.md](./.entire/graph-agent.md) for graph-first discovery
when the graph is available and useful. Read exact named files directly; fall
back to targeted text search and focused source reads when graph retrieval is
unavailable or inconclusive. Verify graph findings against source.
@.entire/graph-agent.md
<!-- entire-graph:end -->

Optional graph tooling must not block useful work. Treat missing graph results
as inconclusive, not proof that code is absent.

## Respect workspace boundaries

The root is a private orchestrator; runtime code belongs under `packages/*`.

| Workspace     | Owns                                                                           |
| ------------- | ------------------------------------------------------------------------------ |
| `hevy-client` | Runtime-neutral native-fetch client and generated API types/schemas            |
| `operations`  | Runtime-neutral reusable Hevy domain operations                                |
| `core`        | Runtime-neutral MCP tools, prompts, resources, execution, and safe diagnostics |
| `node`        | Node server, lifecycle, transports, and telemetry                              |
| `worker`      | Cloudflare bindings, request handling, OAuth, and Worker configuration         |
| `cli`         | Standalone Node command-line client                                            |

`operations` depends on `hevy-client`; `core` depends on both. Adapters consume
these shared packages and do not import one another. Keep Node built-ins and
Cloudflare bindings out of shared runtime-neutral packages. Use topology-approved
exports; do not evade boundaries with private paths or duplicate implementations.

## Apply the existing implementation contracts

### Effect and boundary types

Before writing Effect code, read the installed Effect package's `AGENTS.md`
completely and follow relevant links. Resolve it from the affected workspace.
If absent, use installed source and version-matched official documentation.
Follow CONTRIBUTING's Effect control structure and existing Promise facades.

`ToolDefinition.execute` returns an Effect. Preserve typed errors, cancellation,
deadlines, and the existing execution boundary; do not add separate runners
inside tool implementations or convert unrelated Promise-based adapter code.
Infer handler arguments from schemas. Keep untrusted data `unknown` until
validated; do not bypass schemas with manual casts or `any`.

### MCP changes

Tools live in `packages/core/src/tools/`. Follow `ToolDefinition`, including
`kind`, annotations, `responseContract`, and Effect-returning `execute`.

- Define Zod input shapes in the tool or `tools/input-schemas.ts`; derive
  arguments using `InferToolParams<typeof schema>`.
- Reuse `protocol/response-contracts.ts` and `protocol/output-schemas.ts`.
  Read tools require output schemas; preserve declared write-tool schemas.
- Use `tools/register.ts`, `tools/define-tool.ts`, `ToolRuntime`, the existing
  error policy, `withErrorHandling`, and safe diagnostics.
- Add a co-located test. Input/output, registration, or compatibility changes
  also require a protocol regression through `tools/list` and `tools/call`.
- Verify advertised canonical inputs, supported legacy inputs, and returned
  `structuredContent` against the declared schemas. Keep compatibility parsing
  separate from the advertised schema.

Preserve names, annotations, response contracts, and error behavior unless the
task changes them. Reuse the runtime contract matrix and adapter test lanes.
Measure token cost when descriptions/schemas materially change using
`mise exec -- pnpm run measure:tokens`.

### Generated client

Never hand-edit `packages/hevy-client/src/generated/`. Change the OpenAPI source
or Kubb configuration and run `mise exec -- pnpm run build:client` against the
checked-in specification. Review the complete diff and run the contributor
checks, including `check:openapi` and `check:generated`.

Refresh upstream with `openapi` only for intentional API-contract updates.
Reproducible upstream corrections belong in `scripts/codegen/openapi-spec.js`.
Generated API functions and `.kubb` internals remain private.

## Protect credentials and runtime behavior

Use `.env` or process environment for `HEVY_API_KEY` in local/live lanes.
Never commit real keys or expose them through arguments, URLs, logs, fixtures,
screenshots, or errors. Keep personal workout data and sensitive API responses
out of diagnostics and fixtures. Deterministic tests use fake credentials.

Credentials alone do not authorize live mutations. Use mocks for mutation
tests; create/update/delete live Hevy records only when explicitly authorized.
Do not deploy, publish releases, merge release PRs, or change repository settings
unless the task or an authorized workflow permits it. Prepare and validate the
concrete change before requesting any required final approval.

Ambiguous create outcomes must not trigger blind retries. Routine updates
replace content: omitted exercises are not an unchanged partial update.
Keep stdio stdout reserved for MCP JSON-RPC and use the safe diagnostic path.
Preserve per-request Worker credential isolation.

Worker telemetry exports over OTLP to the project's own OpenTelemetry
Collector. Downstream routing is infrastructure-owned; do not infer a deployed
storage backend from example documentation. Domain-level Cloudflare tracing
and Worker tracing have separate configuration. Distinguish available APIs
from announced features before implementing telemetry changes.

## Validate and finish

- Source changes: run the narrow relevant deterministic lane and the unit suite.
  Use named lanes instead of broad discovery or a parallel test harness.
- Before opening a PR: run CONTRIBUTING's full required baseline, including
  boundary checks, and the checks specific to changed paths. After MCP SDK
  upgrades, inspect `packages/node/src/utils/stdio-observability.ts` and run
  the stdio lane.
- Documentation-only changes: check formatting, relative links, and consistency
  with source. Do not invent runtime tests for prose; required hooks and PR
  checks still apply.
- Never focus/disable tests, weaken assertions, or change checks to hide a
  failure. Keep credential-gated lanes explicit. Distinguish failures, blocked
  checks, and unrun checks from successful validation.
- Tests must not invoke Git or mutate repositories, Git configuration, or Git
  identities. Use pure logic and ordinary filesystem fixtures.

Before every commit, classify the diff using CONTRIBUTING's release policy and
topology propagation. Stage the required Changeset and run
`mise exec -- pnpm run check:changeset`. Empty Changesets are allowed only when
the entire PR is no-release; do not pair one with a release trigger. Worker
configuration changes require Worker release coverage. Do not merge the
automated version PR just because implementation is complete.

Inspect hook formatting changes and exclude unrelated churn. Finish with the
intended diff, synchronized generated output where applicable, and
`git status --short --branch`. Report what changed, validation, remaining limits,
and the review link or local result. Never claim an unrun check or unverified
live deployment succeeded.
