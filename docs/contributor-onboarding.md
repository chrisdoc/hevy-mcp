# Contributor Onboarding

Welcome to **hevy-mcp**! 🎉 This guide walks you through your first contribution — from cloning the repository to opening a pull request. It's a practical quick-start companion to the full reference in [CONTRIBUTING.md](../CONTRIBUTING.md), which you should keep open for deeper details as you go.

> [!NOTE]
> This guide focuses on getting you moving quickly. [CONTRIBUTING.md](../CONTRIBUTING.md) is the authoritative reference for edge cases, detailed rules, and the full validation matrix.

## What is hevy-mcp?

**hevy-mcp** is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for the [Hevy](https://www.hevyapp.com/) fitness API. It lets AI assistants read, analyze, create, and update workouts, routines, exercise templates, and body measurements through the Hevy API. [[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

The project runs in two very different places:

- **Locally** — as a Node.js stdio process on a developer's machine
- **Hosted** — as a Cloudflare Worker serving Streamable HTTP to remote clients

Both deployments run the **same MCP tool contract**, which is the central architectural insight that shapes how the codebase is organized. [[2]](https://app.dosu.dev/documents/8d8e965a-36c3-4f95-b2d6-3779bce46661)

## Quick Setup (5 minutes)

### 1. Clone and install

```bash
git clone https://github.com/chrisdoc/hevy-mcp.git
cd hevy-mcp
nvm use
npm install
npm run build
```

> [!TIP]
> `nvm use` switches to the exact Node.js version in `.nvmrc` (currently Node 24). CI tests against this version — using it locally keeps your environment consistent. [[3]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

### 2. Verify everything works

```bash
npm run test:unit
```

You should see all unit tests pass in about 1–2 seconds. [[2]](https://app.dosu.dev/documents/8d8e965a-36c3-4f95-b2d6-3779bce46661)

> [!NOTE]
> **Integration tests require a Hevy API key** and will fail intentionally without one. `npm run test:unit` is fully deterministic and works without any credentials — it's your go-to command during development. If you need to run integration tests later, copy `.env.sample` to `.env` and add your `HEVY_API_KEY`. [[4]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

### 3. (Optional) Set up Git hooks

Git hooks are managed by [hk](https://github.com/nicholasgasior/hk) via [mise](https://mise.jdx.dev/). Run this once per clone to enable pre-commit, commit-msg, and pre-push hooks:

```bash
mise install
mise exec hk -- hk install --mise
```

> [!NOTE]
> Hooks run formatting, unit tests, commit message linting, and PR validation checks automatically. Never bypass them with `--no-verify`. [[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

## Understanding the Project Structure

The repository is a TypeScript monorepo with five workspace packages under `packages/`. The root is a private orchestrator with no runtime source tree — all implementation lives in the workspaces. [[2]](https://app.dosu.dev/documents/8d8e965a-36c3-4f95-b2d6-3779bce46661)

### The five workspaces

| Workspace | Package name | Role |
|---|---|---|
| `packages/hevy-client/` | `@hevy-mcp/hevy-client` | Runtime-neutral Hevy API client, generated from the OpenAPI spec via Kubb |
| `packages/core/` | `@hevy-mcp/core` | MCP tools, prompts, resources — the shared runtime-neutral implementation |
| `packages/node/` | `hevy-mcp` | Node.js stdio/HTTP adapter, telemetry, process lifecycle |
| `packages/worker/` | `@hevy-mcp/worker` | Cloudflare Worker Streamable HTTP and OAuth adapter |
| `packages/cli/` | `@chrisdoc/hevy-cli` | Public Hevy command-line client |

[[2]](https://app.dosu.dev/documents/8d8e965a-36c3-4f95-b2d6-3779bce46661)

### The most important rule: runtime neutrality

`packages/core` and `packages/hevy-client` **must work on both Node.js and Cloudflare Workers**. This means they cannot use Node.js built-ins (`process`, `fs`, `child_process`, etc.) or Cloudflare-specific bindings. Standard Web APIs only (`fetch`, `URL`, `TextEncoder`, Web Crypto). [[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

Platform-specific code belongs here:

- **`packages/node`** — stdio transport, process lifecycle (`SIGTERM`/`SIGINT`), Node telemetry
- **`packages/worker`** — Cloudflare Worker entrypoint, OAuth 2.1 layer, KV bindings

> [!IMPORTANT]
> The Node adapter (`hevy-mcp`) and the Worker adapter (`@hevy-mcp/worker`) must **never import each other**. The composition graph flows one way: `hevy-client → core → node/worker/CLI`. [[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

### Key files inside `packages/core/src/`

```
packages/core/src/
├── tools/                 # MCP tool implementations (+ co-located *.test.ts)
│   ├── annotations.ts
│   ├── body-measurements.ts
│   ├── folders.ts
│   ├── routines.ts
│   ├── templates.ts
│   ├── user.ts
│   └── workouts.ts
└── utils/                 # Shared helpers
    ├── tool-helpers.ts    # InferToolParams type inference utility
    ├── error-handler.ts   # withErrorHandling wrapper
    ├── response-formatter.ts  # Output schemas and MCP response assembly
    └── cache.ts           # Per-server template/cache helpers
```

> [!NOTE]
> For the full runtime architecture and composition graph, see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Which Tests to Run When

The repository has 20+ test lanes. Here's a practical grouping so you know exactly what to run and when. [[5]](https://github.com/chrisdoc/hevy-mcp/blob/01d1e0ea12f26ff22f8967f52b5577fae7fc03b9/docs/test-lanes.md)

### Daily development — always run these

```bash
npm run test:unit      # Fast unit tests, no credentials needed (~1-2 seconds)
npm run test:mcp       # Mocked MCP integration tests, no credentials needed
```

These two lanes are deterministic and form the core feedback loop during development. [[6]](https://github.com/chrisdoc/hevy-mcp/blob/01d1e0ea12f26ff22f8967f52b5577fae7fc03b9/docs/test-lanes.md#L60-L75)

### Before opening a PR — run all of these

```bash
npm run test:pr           # Full deterministic PR baseline (runs unit, mocked MCP, contract, stdio, worker, worker-http, pack, and more)
npm run test:performance  # Performance checks — currently informational, not a blocking gate
npm run check:changeset   # Verify your changeset file is correct
```

> [!TIP]
> `npm run test:pr` is the single most important pre-PR command. It runs 10 deterministic lanes in one shot and is what CI checks. `npm run test:performance` writes a report to `test-results/performance/summary.json` — timing targets are informational today, but correctness failures are blocking. [[7]](https://github.com/chrisdoc/hevy-mcp/blob/01d1e0ea12f26ff22f8967f52b5577fae7fc03b9/docs/test-lanes.md#L79-L86) [[8]](https://github.com/chrisdoc/hevy-mcp/blob/01d1e0ea12f26ff22f8967f52b5577fae7fc03b9/docs/test-lanes.md#L158-L175)

### Situational — run when relevant

| Command | When to run |
|---|---|
| `npm run test:stdio` | After changes to process lifecycle, stdio transport, diagnostics, or MCP TypeScript SDK upgrades |
| `npm run test:pack` | After changes to package entry points, binary mapping, or published files |
| `npm run test:live` | Only with a valid `HEVY_API_KEY` — runs a read-only canary against the real Hevy API |
| `npm run test:worker` | After changes to the Cloudflare Worker |
| `npm run test:worker-http` | After changes to the Cloudflare Worker HTTP integration |

[[6]](https://github.com/chrisdoc/hevy-mcp/blob/01d1e0ea12f26ff22f8967f52b5577fae7fc03b9/docs/test-lanes.md#L60-L75) [[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

> [!IMPORTANT]
> `npm run test:live` **does not skip gracefully** without an API key — it exits with an error before Vitest even starts. Use `npm run test:unit` for deterministic testing. [[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

See [test-lanes.md](./test-lanes.md) for the complete reference including all lane IDs, runtime ownership, and credential requirements.

## Common Contribution Patterns

Here are step-by-step guides for the most common types of changes.

***

### Pattern A: Adding a new MCP tool

New tools live in `packages/core/` and are shared by both the Node.js and Cloudflare Worker runtimes. [[2]](https://app.dosu.dev/documents/8d8e965a-36c3-4f95-b2d6-3779bce46661)

1. **Create a tool file** in `packages/core/src/tools/` (e.g., `my-feature.ts`)

2. **Define a Zod schema** with `as const`:

   ```typescript
   const myToolSchema = {
     param: z.string(),
   } as const;
   ```

3. **Infer types** with `InferToolParams`:

   ```typescript
   import type { InferToolParams } from "../utils/tool-helpers.js";
   type MyToolParams = InferToolParams<typeof myToolSchema>;
   ```

4. **Implement the handler** with typed parameters, wrapped with `withErrorHandling`:

   ```typescript
   import { withErrorHandling } from "../utils/error-handler.js";
   server.registerTool(
     "my-tool",
     { description: "...", inputSchema: z.object(myToolSchema) },
     withErrorHandling(async (args: MyToolParams) => {
       // args is fully typed — no manual assertions needed
     }, "my-tool"),
   );
   ```

5. **Define response formatting** in `packages/core/src/utils/response-formatter.ts` — co-locate Zod output schemas, raw-to-public normalization, and MCP response assembly there

6. **Register the tool** in `packages/core/src/tools/register.ts`

7. **Add co-located unit tests** as `my-feature.test.ts` next to the implementation

8. **Create a changeset** bumping `@hevy-mcp/core`, `hevy-mcp`, `@hevy-mcp/worker`, and `@chrisdoc/hevy-cli`

> [!TIP]
> See [TYPE_SAFETY_GUIDE.md](./TYPE_SAFETY_GUIDE.md) for the full type safety patterns, including how to annotate `hevyClient` API responses with generated types. Never use `args as { ... }` assertions or `Record<string, unknown>` in handler signatures. [[9]](https://github.com/chrisdoc/hevy-mcp/blob/01d1e0ea12f26ff22f8967f52b5577fae7fc03b9/docs/TYPE_SAFETY_GUIDE.md#L1-L25)

***

### Pattern B: Updating the API client

The Hevy API client under `packages/hevy-client/src/generated/` is **fully generated** by Kubb from the OpenAPI spec. Never edit it manually. [[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

1. **Refresh the OpenAPI spec**:

   ```bash
   npm run openapi
   ```

2. **Regenerate the client**:

   ```bash
   npm run build:client
   ```

3. **Review the generated diff** carefully — look for removed or renamed types that affect existing tools

4. **Update any tools** that consume changed types — annotate `hevyClient` responses with the correct generated types from `@hevy-mcp/hevy-client/types`

5. **Create a changeset** bumping `@hevy-mcp/hevy-client`, `@hevy-mcp/core`, `hevy-mcp`, `@hevy-mcp/worker`, and `@chrisdoc/hevy-cli`

> [!NOTE]
> `npm run openapi` fetches the upstream Hevy spec and will fail with `ENOTFOUND api.hevyapp.com` in sandboxed environments — this is expected. [[2]](https://app.dosu.dev/documents/8d8e965a-36c3-4f95-b2d6-3779bce46661) TypeScript errors inside the generated directory are also expected and should not be patched by hand; fixes belong in `scripts/openapi-spec.js`. [[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

***

### Pattern C: Modifying the Cloudflare Worker

Changes to `packages/worker/` affect only the hosted Cloudflare deployment. [[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

1. **Make changes** in `packages/worker/`

2. **Test locally** with Wrangler dev mode:

   ```bash
   npm run worker:dev
   ```

3. **Validate the bundle** without deploying:

   ```bash
   npm run worker:dry-run
   ```

4. **Run Worker tests**:

   ```bash
   npm run test:worker
   npm run test:worker-http
   ```

5. **Create a changeset** bumping `@hevy-mcp/worker` only

> [!NOTE]
> Changes to `cloudflare.config.ts` also count as Worker changes and require a Worker changeset, even though the file sits at the repo root. [[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

***

### Pattern D: Documentation or CI-only changes

1. **Make your changes**

2. **Run formatting and linting**:

   ```bash
   npm run check
   ```

3. **Create an empty changeset**:

   ```bash
   npx changeset --empty
   ```

4. Confirm this qualifies: **no workspace package code or explicit release triggers were changed** (no files under `packages/*`, no `cloudflare.config.ts`)

> [!IMPORTANT]
> The empty changeset is only valid when the entire PR is internal-only. If you changed any file under `packages/*`, you need a bump changeset, regardless of the Conventional Commit type (`docs:`, `chore:`, etc.). The Conventional Commit type does **not** determine changeset eligibility. [[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

## The Changeset Workflow

Every PR must include a changeset file. This is how the project tracks versions and releases across its workspace packages. [[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae) The [Common Contribution Patterns](#common-contribution-patterns) section above already tells you which packages to bump for each scenario — this section explains the mechanics.

### The quick decision

> **Did you change any files under `packages/*` or `cloudflare.config.ts`?**
> 
> - **Yes** → create a **bump changeset** naming every affected package
> - **No (pure docs, CI, or tooling)** → an **empty changeset** is likely fine

> [!IMPORTANT]
> The Conventional Commit type (`docs:`, `chore:`, `ci:`, etc.) does **not** determine changeset eligibility. What matters is whether the change touches workspace code or an explicit release trigger. [[2]](https://app.dosu.dev/documents/8d8e965a-36c3-4f95-b2d6-3779bce46661)

### Creating a bump changeset

```bash
npx changeset
```

This opens an interactive prompt. Select the affected packages and choose the release impact:

- `patch` — bug fixes, minor improvements
- `minor` — new features, backward-compatible additions
- `major` — breaking changes

### Creating an empty changeset

```bash
npx changeset --empty
```

Use this for pure documentation, CI, or repository tooling changes that don't affect any workspace package.

### Validating your changeset

```bash
npm run check:changeset
```

Run this before committing. CI will also run it and fail the PR if no valid changeset is present. [[2]](https://app.dosu.dev/documents/8d8e965a-36c3-4f95-b2d6-3779bce46661)

### The cascade rules

Because `core` and `hevy-client` are bundled into the published adapters, changing a shared package requires bumping every downstream consumer:

| Changed composition | Required changeset packages |
|---|---|
| `@hevy-mcp/hevy-client` | `@hevy-mcp/hevy-client`, `@hevy-mcp/core`, `hevy-mcp`, `@hevy-mcp/worker`, `@chrisdoc/hevy-cli` |
| `@hevy-mcp/core` | `@hevy-mcp/core`, `hevy-mcp`, `@hevy-mcp/worker`, `@chrisdoc/hevy-cli` |
| Node adapter only | `hevy-mcp` only |
| Worker only (or `cloudflare.config.ts`) | `@hevy-mcp/worker` only |
| CLI only | `@chrisdoc/hevy-cli` only |

[[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

> [!NOTE]
> For the full changeset cascade rules, including private package versioning behavior and release cadence, see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Git Workflow

### Branch from latest `origin/main`

Always start fresh from the latest `origin/main` — never work from a stale local branch:

```bash
git fetch origin
git checkout -b feat/my-feature origin/main
```

Never commit directly to `main` — branch protection blocks it. [[2]](https://app.dosu.dev/documents/8d8e965a-36c3-4f95-b2d6-3779bce46661)

### Use Conventional Commits

All commits must use the [Conventional Commits](https://www.conventionalcommits.org/) format: [[2]](https://app.dosu.dev/documents/8d8e965a-36c3-4f95-b2d6-3779bce46661)

```
feat: add get-workout-streak tool
fix: handle missing exercise template gracefully
docs: update contributor onboarding guide
test: add unit tests for response formatter
refactor: extract pagination helper
build: upgrade MCP TypeScript SDK
ci: add worker-http lane to PR aggregate
chore: update dev dependencies
```

### Never bypass Git hooks

The pre-commit, commit-msg, and pre-push hooks run formatting, linting, unit tests, and changeset checks automatically. Never use `--no-verify`. Fix the underlying failure instead. [[2]](https://app.dosu.dev/documents/8d8e965a-36c3-4f95-b2d6-3779bce46661)

### PR checklist

Before opening your pull request, verify all of the following pass locally:

1. **Formatting and linting:**

   ```bash
   npm run check
   ```

2. **TypeScript type checking:**

   ```bash
   npm run check:types
   ```

3. **Build:**

   ```bash
   npm run build
   ```

4. **Full PR test baseline:**

   ```bash
   npm run test:pr
   npm run test:performance
   ```

5. **Changeset validation:**

   ```bash
   npm run check:changeset
   ```

[[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

> [!TIP]
> The pre-push hook runs `types`, `changeset-status`, and the full `pull-request` aggregate automatically when you `git push`. This is your safety net — but running the checks manually first makes the push faster and avoids surprises. [[10]](https://github.com/chrisdoc/hevy-mcp/blob/01d1e0ea12f26ff22f8967f52b5577fae7fc03b9/docs/test-lanes.md#L49-L55)

## Troubleshooting Common Issues

### "Build fails with formatting or linting errors"

Run the formatter/linter to identify problems:

```bash
npm run check
```

For automated fixes, use:

```bash
npm run check:fix
```

Review the diff before staging — `check:fix` modifies files but does not stage them. [[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

***

### "TypeScript errors inside `packages/hevy-client/src/generated/`"

This is **expected**. The generated client directory contains auto-generated TypeScript that may have known type errors from the upstream OpenAPI spec. Do not patch these files by hand. If a fix is needed, add it to `scripts/openapi-spec.js` so it survives future regenerations. [[2]](https://app.dosu.dev/documents/8d8e965a-36c3-4f95-b2d6-3779bce46661)

***

### "Integration tests fail without an API key"

This is **by design**. `npm run test:live` exits with an error before Vitest even starts when `HEVY_API_KEY` is absent. For deterministic testing during development, use: [[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

```bash
npm run test:unit    # unit tests only
npm run test:mcp     # mocked MCP integration tests
```

***

### "`npm run openapi` fails with `ENOTFOUND`"

This is **expected in sandboxed environments**. The command fetches the live Hevy OpenAPI spec from `api.hevyapp.com` and cannot reach it without network access. If you're working on a client regeneration locally, make sure you have outbound network access before running this command. [[2]](https://app.dosu.dev/documents/8d8e965a-36c3-4f95-b2d6-3779bce46661)

***

### "Git hook failures on commit or push"

If your Git hooks aren't running or are failing with unexpected errors, re-install them:

```bash
mise install
mise exec hk -- hk install --mise
```

This sets up the hk-managed hooks (formatting, unit tests, commit message linting, and pre-push validation) without requiring mise to be fully activated in your shell. [[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae)

***

### "TypeScript errors in tool handlers"

If you're seeing type errors like `Property 'x' does not exist on type 'Record<string, unknown>'`, you likely need to use the `InferToolParams` pattern:

```typescript
import type { InferToolParams } from "../utils/tool-helpers.js";

const mySchema = { param: z.string() } as const;
type MyParams = InferToolParams<typeof mySchema>;
```

See [TYPE_SAFETY_GUIDE.md](./TYPE_SAFETY_GUIDE.md) for the complete pattern and how to find the correct generated response types. [[11]](https://github.com/chrisdoc/hevy-mcp/blob/01d1e0ea12f26ff22f8967f52b5577fae7fc03b9/docs/TYPE_SAFETY_GUIDE.md#L1-L50)

## Related Documentation

| Document | What it covers |
|---|---|
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Full contributor reference: prerequisites, local development, all test lanes, Cloudflare Worker development, changeset rules, and PR requirements |
| [test-lanes.md](./test-lanes.md) | Complete test lane reference: all lane IDs, runtime ownership, credential requirements, aggregate definitions, and performance baseline details |
| [TYPE_SAFETY_GUIDE.md](./TYPE_SAFETY_GUIDE.md) | Type safety patterns: `InferToolParams` usage, generated API response types, `hevyClient` annotation rules, and troubleshooting type errors |
| [token-cost-tracking.md](./token-cost-tracking.md) | Token measurement guide: when and how to run `npm run measure:tokens` after changing tool descriptions or schemas |

[[1]](https://app.dosu.dev/documents/52dd122f-29f8-46dd-9513-3476b4dbb3ae) [[5]](https://github.com/chrisdoc/hevy-mcp/blob/01d1e0ea12f26ff22f8967f52b5577fae7fc03b9/docs/test-lanes.md) [[12]](https://github.com/chrisdoc/hevy-mcp/blob/01d1e0ea12f26ff22f8967f52b5577fae7fc03b9/docs/TYPE_SAFETY_GUIDE.md)

***

*This guide is maintained alongside [CONTRIBUTING.md](../CONTRIBUTING.md). If you find something missing or outdated, please open a PR.*
