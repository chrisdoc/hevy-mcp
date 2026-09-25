# Agent Instructions for hevy-mcp

Read this file before changing the repository. Keep it focused on agent-only
rules; use the sources below for detailed procedures and changing facts.

## Working tree and Git safety

Inspect `git status --short --branch` and the existing worktrees before making
changes. Choose the checkout according to the task:

- For new implementation work, use a dedicated feature branch and isolated
  worktree based on the intended target branch, normally `origin/main`.
  Fetch the target branch before creating the worktree.
- For an existing PR or branch, work from that branch rather than starting
  over from `main`. Reuse a suitable isolated worktree supplied by the user
  or agent environment.
- Read-only reviews do not require a new branch, worktree, or dependency install.

Preserve unrelated changes and leave other checkouts untouched. Never reset,
discard, or overwrite user changes. Stop and ask when proceeding would risk
those changes. Never commit or push directly to `main`, and do not force-push
without explicit authorization. Use Conventional Commits and keep Git hooks
enabled; investigate failures instead of bypassing them.

### Git safety in tests

- Never write tests that invoke Git, execute `git` commands, or mutate Git
  repositories or Git configuration. Use pure logic and ordinary filesystem
  fixtures instead.
- Never create, configure, or persist test Git identities such as
  `user.name`, `user.email`, `GIT_AUTHOR_*`, or `GIT_COMMITTER_*`.

## Setup and sources of truth

- [CONTRIBUTING.md](./CONTRIBUTING.md) owns development setup, Node policy,
  Worker operations, release policy, and the required validation baseline.
  Read the relevant section before that class of change.
- [docs/test-lanes.md](./docs/test-lanes.md) describes named test lanes;
  [repository/validation-lanes.json](./repository/validation-lanes.json)
  defines the canonical lane registry. Prefer named aliases to raw selectors.
- [repository/topology.json](./repository/topology.json) owns workspace
  boundaries, allowed imports, and release propagation. Do not duplicate the
  package/version cascade here.
- [package.json](./package.json) owns command names, and
  [mise.toml](./mise.toml) owns development tool versions. Inspect them rather
  than copying versions or command lists into new documentation.

Use mise for Node.js and pnpm. Follow the contributor setup to install the
pinned tools, install dependencies in the working checkout, and enable Lefthook.
Run development commands through mise, for example `mise exec -- pnpm ...`,
`mise exec -- npx ...`, and `mise exec -- node ...`; do not silently fall back
to system tool versions. Report unavailable setup or tools as a limitation.

Prefer GitHub MCP for GitHub operations. If it is unavailable or cannot perform
the required operation, use an available authenticated alternative such as
`gh`, with the same authorization and safety boundaries.

## Code discovery

<!-- entire-graph:begin -->

Read [.entire/graph-agent.md](./.entire/graph-agent.md) for graph-first discovery
when the graph is available and useful. Read exact named files directly; fall
back to targeted text search and focused source reads when graph retrieval is
unavailable or inconclusive. Verify graph findings against source.
@.entire/graph-agent.md
<!-- entire-graph:end -->

## Architecture boundaries

The root is a private workspace orchestrator, not a runtime `src/` tree.

- `packages/hevy-client` owns the runtime-neutral native-fetch client and
  generated API types/schemas.
- `packages/operations` owns runtime-neutral reusable Hevy domain operations.
- `packages/core` owns runtime-neutral MCP construction, tools, prompts,
  resources, execution, and safe diagnostics.
- `packages/node` owns the Node server, lifecycle, transports, and telemetry.
- `packages/worker` owns Cloudflare bindings, request handling, and OAuth.
- `packages/cli` owns the standalone Node command-line client.

`operations` depends on `hevy-client`; `core` depends on both. Adapters consume
runtime-neutral packages and do not import one another. Keep Node built-ins
and Cloudflare bindings out of `hevy-client`, `operations`, and `core`.
Respect the import allowlists in the topology; do not work around them with
private paths or duplicate runtime implementations in adapters.

## Effect and coding conventions

Before writing Effect code, read the installed Effect package's `AGENTS.md`
completely and follow its relevant links. Resolve it from the workspace being
changed rather than assuming `node_modules/effect` exists at the root. If the
guide is absent, inspect that installed package's source and version-matched
official documentation. Do not use examples from a different Effect version.

Follow the existing Effect control structure in `CONTRIBUTING.md`.
`ToolDefinition.execute` returns an Effect; preserve typed errors,
cancellation, deadlines, and the existing runtime execution boundary. Do not
introduce separate Effect runners inside tool implementations. Preserve the
supported Promise facades and Promise-based adapter code rather than converting
them as part of unrelated work.

Handler arguments are schema-inferred. Treat untrusted boundary data as
`unknown` until validated; do not bypass validation with manual argument casts
or `any`. Follow the repository's linting and formatting configuration instead
of duplicating generic language or framework rules here. Inspect formatting
changes and exclude unrelated churn.

## MCP contracts

MCP tools live in `packages/core/src/tools/`. Follow the existing
`ToolDefinition` pattern, including `kind`, annotations, `responseContract`,
and Effect-returning `execute`:

1. Define the Zod input shape in the tool file or `tools/input-schemas.ts`;
   derive arguments with `InferToolParams<typeof schema>`.
2. Reuse the contracts in `protocol/response-contracts.ts` and schemas in
   `protocol/output-schemas.ts`. Read tools require an output schema; preserve
   declared write-tool output schemas too.
3. Register through the existing `tools/register.ts` and `tools/define-tool.ts`
   pipeline. Reuse `ToolRuntime`, the error policy, `withErrorHandling`, and
   safe diagnostics rather than introducing parallel response/error formats.
4. Add a co-located test. For input, output, registration, or compatibility
   changes, also add a protocol-level regression through `tools/list` and
   `tools/call`; a direct handler test alone is insufficient.

Verify that canonical inputs advertised by `tools/list` are accepted by
`tools/call`, supported legacy inputs remain covered, and declared output
schemas match returned `structuredContent`. Keep compatibility parsing
separate from the canonical advertised schema. Preserve tool names,
annotations, response contracts, and error behavior unless the task explicitly
changes them. Reuse the existing runtime contract matrix and adapter test lanes
for the affected paths; do not build a parallel test harness.

Measure token cost when tool descriptions or schemas materially change with
`mise exec -- pnpm run measure:tokens`.

## Generated client

Never hand-edit `packages/hevy-client/src/generated/`. Change the OpenAPI
source or Kubb configuration, then regenerate using the checked-in specification
with `mise exec -- pnpm run build:client`. Review the complete generated diff
and investigate unexpected changes.

Refresh upstream only when the task intentionally updates the API contract;
`mise exec -- pnpm run openapi` needs network access and is not a prerequisite
for unrelated regeneration. Reproducible upstream corrections belong in
`scripts/codegen/openapi-spec.js`. Follow the generated-client checks in
`CONTRIBUTING.md`, including `check:openapi` and `check:generated`.

Consumers use curated package exports allowed by the topology; generated API
functions and `.kubb` internals remain private.

## Credentials and external side effects

Use `HEVY_API_KEY` through `.env` or the process environment for Node/local live
lanes. Never commit `.env` or real keys, or expose keys in arguments, URLs,
logs, fixtures, screenshots, or errors. Do not copy personal workout data or
sensitive response bodies into fixtures or diagnostics. Deterministic lanes
use fake credentials and do not need a live key.

Credentials are not permission to modify live data. Do not create, update, or
delete live Hevy records during development/testing unless explicitly authorized
for the task. Use mocked services for mutation tests. Do not deploy, publish,
merge release PRs, or change repository settings unless the task or an explicitly
authorized workflow permits it. Follow the contributor guide for bounded,
read-only live canaries when appropriate.

Preserve mutation semantics: ambiguous create outcomes must not trigger blind
retries that can create duplicates. Routine updates replace content, so omitted
exercises must not be treated as an unchanged partial update.

Keep stdio stdout reserved for MCP JSON-RPC; send diagnostics through the
existing safe logging path. Before changing transport behavior, read
`packages/node/README.md`. Before changing Worker deployment, origins,
authentication, or OAuth, read the Worker section of `CONTRIBUTING.md` and
preserve per-request credential isolation.

## Validation and release requirements

For source changes, run the narrow relevant deterministic lane and the unit
suite. Before opening a PR, run the full required validation baseline from
`CONTRIBUTING.md`, including boundary checks, plus the checks for the changed
paths. Use `docs/test-lanes.md` to select lanes; broad test discovery is not a
substitute. After MCP SDK upgrades, inspect the private SDK assumptions in
`packages/node/src/utils/stdio-observability.ts` and run the stdio lane.

Do not focus or disable tests, weaken assertions, or change checks to hide
failures. Keep intentional credential-gated lanes explicit. Investigate check
failures; distinguish failed, blocked, and unrun checks in the PR rather than
claiming they passed.

Before each commit, classify the diff using the release policy in
`CONTRIBUTING.md` and propagation in `repository/topology.json`. Include the
required Changeset and stage it before committing. Use an empty Changeset only
when the entire PR qualifies as no-release; never pair one with a release
trigger. Run `mise exec -- pnpm run check:changeset`. Do not merge the automated
version PR merely because a change is complete.

## Completion

Confirm the diff contains only intended changes, relevant generated output is
synchronized, and release requirements are satisfied. Check
`git status --short --branch` in the working checkout. Report the change,
validation results and limitations, and any remaining risks; never describe
unrun checks or an unverified deployment as successful.
