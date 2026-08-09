# Agent Instructions for hevy-mcp

Read this file before changing the repository. Keep this file focused on
agent-only rules; use the linked documents and repository configuration as the
source of truth for detailed commands and changing facts.

## Start in a fresh worktree

1. Inspect the checkout before touching it:

   ```bash
   git status --short --branch
   ```

2. Fetch the current base and create a dedicated feature branch/worktree from
   it:

   ```bash
   git fetch origin main
   git worktree add -b <type>/<topic> ../hevy-mcp-<topic> origin/main
   ```

   Use a branch type such as `feat`, `fix`, `docs`, `test`, `refactor`, or
   `chore`. Preserve existing user changes; ask before proceeding if creating
   the worktree would risk them.

3. Implement and validate in the new worktree. The work is ready for review
   only when the branch is based on `origin/main`, is not `main`, and the
   original checkout remains untouched.

Never push directly to `main`. Use Conventional Commits (`feat:`, `fix:`,
`docs:`, `test:`, `refactor:`, `build:`, `ci:`, `chore:`, or `style:`) and keep
Git hooks enabled. Fix hook failures instead of bypassing them.

## Git safety in tests

- Never write tests that invoke Git, execute `git` commands, or mutate Git
  repositories or Git configuration. Use pure logic and ordinary filesystem
  fixtures instead.
- Never create, configure, or persist test Git identities such as
  `user.name`, `user.email`, `GIT_AUTHOR_*`, or `GIT_COMMITTER_*`.

## Source-of-truth pointers

- `CONTRIBUTING.md` owns development setup, Node policy, Worker operations,
  release policy, and the required validation baseline. Read the relevant
  section before that class of change.
- `docs/test-lanes.md` owns named test lanes. Prefer the `npm run test:*`
  aliases over copying raw Vitest selectors.
- `repository/topology.json` owns workspace boundaries and release bundles.
- `package.json` owns the current command names. Inspect it instead of
  copying command details into new documentation.
- Use the GitHub MCP server for GitHub operations. Use `gh` only when the
  GitHub MCP server cannot complete the operation because of a token problem.

## Runtime and package manager

Use mise for Node.js and npm. The repository pins Node.js 24 and npm 12 in
`mise.toml`; install the pinned tools before running development commands:

```bash
mise install
```

Run Node.js and npm commands through mise so they do not fall back to system
installations. Use `mise exec -- npm ...`, `mise exec -- npx ...`, and
`mise exec -- node ...` in setup, validation, and troubleshooting commands.

Git hooks are managed by hk. After `mise install`, enable them once per clone
with:

```bash
mise exec hk -- hk install --mise
```

## Repository shape and boundaries

The root is a private workspace orchestrator and has no runtime `src/` tree.
The six workspaces are:

- `packages/hevy-client` — runtime-neutral native-fetch Hevy client, curated
  exports, and Kubb-generated API types/schemas.
- `packages/operations` — runtime-neutral reusable Hevy domain operations.
- `packages/core` — runtime-neutral MCP server construction, tools, prompts,
  resources, execution, and safe diagnostics.
- `packages/node` — public Node package `hevy-mcp`; Node lifecycle, stdio and
  local Streamable HTTP transports, telemetry, and Node built-ins.
- `packages/worker` — private Cloudflare Worker Streamable HTTP and optional
  OAuth adapter.
- `packages/cli` — public Node package `@chrisdoc/hevy-cli`; the standalone
  Hevy command-line client.

The dependency direction is `hevy-client -> operations -> core`, with `core`
also depending directly on `hevy-client`; Node, Worker, and CLI are adapters
that consume the runtime-neutral packages. Adapters do not import one another.
Keep Node built-ins and Cloudflare bindings out of `hevy-client`, `operations`,
and `core`. Keep Node-only lifecycle, transport, telemetry, and observability
in `packages/node`; keep Worker bindings and OAuth in `packages/worker`.

## Generated client

Treat every file under `packages/hevy-client/src/generated/` as generated
output. Change the OpenAPI source or the Kubb configuration, then regenerate:

```bash
mise exec -- npm run openapi          # refreshes the upstream spec; needs network access
mise exec -- npm run build:client
mise exec -- npm run check:openapi
mise exec -- npm run check:generated
```

Review the complete generated diff. Consumers use the curated
`@hevy-mcp/hevy-client`, `@hevy-mcp/hevy-client/types`, and
`@hevy-mcp/hevy-client/schemas` exports; generated API functions and `.kubb`
internals are private. Upstream schema corrections belong in
`scripts/openapi-spec.js` so regeneration remains reproducible.

## MCP and type-safety conventions

MCP tools live in `packages/core/src/tools/`. Follow the existing tool-definition
pattern when adding or changing one:

1. Put the Zod input shape in the relevant tool file or
   `tools/input-schemas.ts`.
2. Derive handler arguments with
   `InferToolParams<typeof schema>`; keep the schema as the single source of
   truth for validation and types.
3. Define the response contract and output schema for read tools in
   `utils/response-contracts.ts`.
4. Register the definition through `tools/register.ts`, use the existing
   `ToolRuntime` error/observation path, and add a co-located test.
5. Measure token cost when tool descriptions or schemas materially change:
   `npm run measure:tokens`.

Handlers receive inferred arguments. Keep manual argument casts, `any`, and
`unknown` out of tool-handler code. Reuse the existing error policy,
`withErrorHandling` path, response contracts, and safe diagnostics rather than
creating parallel response or error formats.

## Secrets and runtime behavior

Use `HEVY_API_KEY` through `.env` or the process environment. Keep `.env` and
real keys untracked, and keep keys out of command-line arguments, URLs, logs,
fixtures, screenshots, and error messages. Deterministic unit, mocked MCP,
contract, stdio, package, and performance lanes use fake credentials and do not
need a live key. Live Hevy lanes require a valid `HEVY_API_KEY`.

The Node executable defaults to stdio and also supports local Streamable HTTP
with `--transport http`; inspect `packages/node/README.md` or `--help` before
changing transport behavior. The Worker serves stateless Streamable HTTP at
`POST /mcp`, authenticates the request bearer value, and keeps OAuth optional
behind the `OAUTH_KV` binding. Read the Worker section of `CONTRIBUTING.md`
before changing deployment, origin, authentication, or OAuth behavior.

## Changesets and release identity

Before every commit, classify the diff and run:

```bash
npm run check:changeset
```

A change under `packages/*`, a runtime-visible behavior change, a workspace
dependency change, or `cloudflare.config.ts` requires a non-empty bump
Changeset. Name the changed package and every transitive shipped consumer from
`repository/topology.json`; do not couple unrelated packages. The current
cascade is:

- `@hevy-mcp/hevy-client` -> `@hevy-mcp/hevy-client`,
  `@hevy-mcp/operations`, `@hevy-mcp/core`, `hevy-mcp`,
  `@hevy-mcp/worker`, `@chrisdoc/hevy-cli`.
- `@hevy-mcp/operations` -> `@hevy-mcp/operations`,
  `@hevy-mcp/core`, `hevy-mcp`, `@hevy-mcp/worker`,
  `@chrisdoc/hevy-cli`.
- `@hevy-mcp/core` -> `@hevy-mcp/core`, `hevy-mcp`,
  `@hevy-mcp/worker`, `@chrisdoc/hevy-cli`.
- Node-only, Worker-only, and CLI-only changes bump only their respective
  package; `cloudflare.config.ts` is a Worker change.

Core, client, operations, and Worker are private but versioned for internal
release/deployment identity. Node and CLI are public. Merge the automated
`changeset-release/main` Version Packages pull request on the routine cadence
(weekly by default); reserve off-cycle releases for security fixes and
high-impact user-facing bugs. An entirely no-release, repository-only change
may use an eligible empty Changeset via `npx changeset --empty`; docs, CI,
repository-only tests/tooling, and chores qualify only when no release trigger
is present. An empty Changeset never accompanies a release trigger. Stage the
Changeset before committing.

## Validation workflow

For source changes, run the narrow relevant lane and the unit suite. Before a
pull request, use the repository baseline from `CONTRIBUTING.md`:

```bash
mise exec -- npm run check
mise exec -- npm run check:types
mise exec -- npm run build
mise exec -- npm run test:pr
mise exec -- npm run test:performance
mise exec -- npm run check:changeset
```

Useful focused checks include:

- `npm run test:stdio` after MCP SDK, stdio, lifecycle, or Node transport
  changes. `packages/node/src/utils/stdio-observability.ts` uses private MCP
  SDK fields, so inspect compatibility after every SDK upgrade.
- `npm run test:worker`, `npm run test:worker-http`, and
  `npm run worker:dry-run` after Worker changes.
- `npm run test:pack` or `npm run test:pack:cli` after package entry point,
  binary, manifest, or published-file changes.
- `npm run check:server-manifest` after server metadata changes.
- `npm run check:boundaries` after workspace dependency or runtime-boundary
  changes.

`npm run test:unit` is the deterministic default for local source work.
`npm test` builds first and runs broad Vitest discovery; it is not a substitute
for the named PR lanes. Integration, live, nightly, and live Worker commands
are credential-gated and should be run only when the relevant safe credentials
and environment are available.

Known environment-dependent operations:

- `npm run openapi` needs network access to the upstream Hevy API and may fail
  with `ENOTFOUND api.hevyapp.com` in a sandbox.
- `npm run inspect` may time out without a correctly configured MCP client or
  browser environment.

Treat all other documented checks, including `npm run check:types`, as real
failures to investigate.

## Completion checklist

Before reporting completion, confirm that the diff is focused, tests and
checks for the changed paths passed (or their limitations are explicit),
generated output is synchronized, the release requirement is satisfied, and
`git status --short --branch` shows only intended files on the feature branch.
