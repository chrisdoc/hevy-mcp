# Agent Instructions for hevy-mcp

**ALWAYS follow these instructions first and only fallback to search or additional context if the information here is incomplete or found to be in error.**

## Project Overview

- **hevy-mcp** is a Model Context Protocol (MCP) server for the Hevy Fitness API, enabling AI agents to manage workouts, routines, exercise templates, and folders via the Hevy API.
- The codebase is TypeScript (Node.js v24+), with a clear separation between tool implementations (`src/tools/`), generated API clients (`src/generated/`), and utility logic (`src/utils/`).
- API client code is generated from the OpenAPI spec using [Kubb](https://kubb.dev/). **Do not manually edit generated files.**
- **Type Safety:** The project uses Zod schema inference for type-safe tool parameters, eliminating manual type assertions and ensuring compile-time type safety.
- **MCP SDK internals sensitivity:** `src/utils/stdio-observability.ts` depends on MCP SDK stdio internals (private fields such as `_ondata`/`_readBuffer`) for raw chunk instrumentation. Re-run the stdio observability test suite after any `@modelcontextprotocol/sdk` upgrade.

## Git & Workflow Standards

- **Conventional Commits**: AI agents (such as Claude Code, Antigravity, etc.) and developers must always use the conventional commit format (e.g., `feat:`, `fix:`, `refactor:`, `build:`, `ci:`, `chore:`, `docs:`, `style:`, `test:`) for all commits they generate or suggest.
- **No Direct Pushes to `main` (CRITICAL)**: Pushing directly to the `main` branch is strictly prohibited and blocked by branch protection. All development must be done on feature branches (e.g., `feat/some-feature` or `fix/some-bug`) and submitted via a Pull Request.
- **Changesets (CRITICAL)**: The project uses [Changesets](https://github.com/changesets/changesets) for versioning and releases.
  - **RELEASE CADENCE**: Merge the automated `changeset-release/main` (**"Version Packages"**) Pull Request on a regular cadence (weekly is the default), not via ad-hoc frequent merges.
  - **URGENT EXCEPTION**: Security fixes and high-impact user-facing bug fixes may be released immediately outside the routine cadence.
  - **WHEN TO USE**: Every single PR/change that modifies source code or package dependencies **MUST** include a changeset file.
  - **HOW TO CREATE BUMP CHANGESETS**: Use `npx changeset` with `patch`/`minor`/`major` **only** for user-facing, runtime-visible changes.
  - **NO-OP / NO-RELEASE CHANGES**: For docs, CI config, internal tests, refactoring, and other internal-only changes, you **MUST** run `npx changeset --empty`.
  - **CI ENFORCEMENT**: Pull Requests are guarded by a CI check that runs `npm run check:changeset` (which runs `npx changeset status --since=origin/<base_branch>`). CI will fail if no changeset file is staged/committed.
  - **VALIDATION**: You can validate your changeset status locally by running `npm run check:changeset`. Make sure the changeset file is staged/committed.

## Agent Tool Requirements

### Documentation and Research

- **Context7**: MUST use Context7 for any library and API documentation needs
- **GitHub Integration**: MUST use the GitHub MCP server for all GitHub interactions and only use `gh` if there is a problem with the personal access token
- **AI Feedback**: MUST ask Gemini for feedback (about a design, code review, etc.) but remember Gemini has no memory so everything must be provided in the prompt and you must refer to files using the @ syntax

## Working Effectively

### Bootstrap and Build Repository

Run these commands in order to set up a working development environment (npm is the package manager for this project):

1. **Install dependencies:**

   ```bash
   npm install
   ```

   - Takes approximately 30 seconds. NEVER CANCEL - set timeout to 60+ seconds.

2. **Build the project:**

   ```bash
   npm run build
   ```

   - Takes approximately 3-5 seconds. TypeScript compilation via tsdown.
   - Always build before running the server or testing changes.

3. **Run linting/formatting:**

   ```bash
   npm run check
   ```

   - Takes less than 1 second.
   - **EXPECTED WARNING:** Warnings from oxlint are expected and can be ignored.

### Testing Commands

4. **Run unit tests only:**

   ```bash
   npx vitest run --exclude tests/integration/**
   ```

   - Takes approximately 1-2 seconds. NEVER CANCEL.
   - This is the primary testing command for development.

5. **Run integration tests (requires API key):**

   ```bash
   npx vitest run tests/integration
   ```

   - **WILL FAIL** without valid `HEVY_API_KEY` in `.env` file (by design).
   - Integration tests require real API access and cannot run in sandboxed environments.

6. **Run all tests:**

   ```bash
   npm test
   ```

   - Takes approximately 1-2 seconds for unit tests only (without API key).
   - **WILL FAIL** if `HEVY_API_KEY` is missing due to integration test failure (by design).

### API Client Generation

7. **Regenerate API client from OpenAPI spec:**

   ```bash
   npm run build:client
   ```

   - Takes approximately 4-5 seconds. NEVER CANCEL.
   - **EXPECTED WARNINGS:** OpenAPI validation warnings about missing schemas are normal.
   - If you need to refresh `openapi-spec.json` from Hevy first, run `npm run openapi`.
   - `npm run openapi` fetches the upstream spec and **WILL FAIL** with `ENOTFOUND api.hevyapp.com` in sandboxed environments.
   - Always run `npm run build:client` after updating `openapi-spec.json`.

### Server Operations

9. **Development server (with hot reload):**

   ```bash
   npm run dev
   ```

   - **REQUIRES:** Valid `HEVY_API_KEY` in `.env` file or will exit immediately.
   - Server runs indefinitely until stopped.

10. **Production server:**

```bash
npm start
```

- **REQUIRES:** Valid `HEVY_API_KEY` in `.env` file or will exit immediately.
- Must run `npm run build` first.

## Commands With Known Environment Limitations

### Known Failing Commands

- **`npm run openapi`**: Fails with network error (`ENOTFOUND api.hevyapp.com`) in sandboxed environments.
- **`npm run inspect`**: MCP inspector tool - may timeout in environments without proper MCP client setup.

Only list commands here that are known to be flaky or unsupported in some
environments. Other documented commands (including `npm run check:types`) are
expected to succeed locally; treat failures as issues to fix rather than
environmental flakiness. See `CONTRIBUTING.md` for the canonical list of
commands.

`npm run check:types` is expected to pass locally before opening a PR; see the
"Type checking validation" section below.

## Environment Setup

### Required Environment Variables

Create a `.env` file in the project root with:

```env
HEVY_API_KEY=your_hevy_api_key_here
```

Always provide the API key through `HEVY_API_KEY`.

Do **not** pass API keys via CLI arguments
(`--hevy-api-key=...`, `--hevyApiKey=...`, `hevy-api-key=...`). These CLI
forms are unsupported and insecure.

**CRITICAL:** Without this API key:

- Servers will not start
- Integration tests will fail (by design)
- API client functionality cannot be tested

### Node.js Version

- **Supported:** Node.js >= 24
- **Recommended:** Use the exact version pinned in `.nvmrc` (CI uses this exact version)
- If you use `nvm`, run `nvm use` in the repo root to match `.nvmrc`
- Use `node --version` to verify current version

## Validation After Changes

### Manual Testing Scenarios

Always perform these validation steps after making changes:

1. **Build validation:**

   ```bash
   npm run build
   ```

   - Must complete successfully without errors.

2. **Unit test validation:**

   ```bash
   npx vitest run --exclude tests/integration/**
   ```

   - All unit tests must pass.

3. **Code style validation:**

   ```bash
   npm run check
   ```

   - Must complete without errors (warnings about oxlint and oxfmt schema are acceptable).
   - No tool-specific lint warnings are expected; treat reported code warnings
     as issues to fix.

4. **Type checking validation:**

   ```bash
   npm run check:types
   ```

   - Must complete without errors.
   - Runs the TypeScript compiler in check-only mode (no emitted files), as
     configured in the `check:types` script in `package.json`.
   - Note: `npm run build` (tsup) may still succeed when this fails.
   - Treat failures here as issues to fix (even if the build passes).
   - Run this locally before opening a PR; CI also runs this check on pull
     requests and pushes to `main`.
   - Verifies all type inference is working correctly.

5. **MCP tool functionality validation (if API key available):**
   - Start development server: `npm run dev`
   - Test MCP tool endpoints with a client
   - Verify tool responses are correctly formatted

### Critical Validation Notes

- **ALWAYS** run unit tests after any source code changes
- **ALWAYS** run build validation before committing changes
- **ALWAYS** use type inference (`InferToolParams`) instead of manual type assertions
- **DO NOT** attempt to fix TypeScript errors in `src/generated/` - these are auto-generated files
- **DO NOT** commit `.env` files containing real API keys
- **DO NOT** use `as any` or `as unknown` type assertions in tool handlers

## Project Structure and Key Files

### Source Code Organization

```
src/
├── cli.ts             # Node.js stdio executable entrypoint
├── index.ts           # Node-only stdio server, telemetry, and observability
├── worker.ts          # Cloudflare Worker Streamable HTTP entrypoint
├── worker-oauth.ts    # Optional Worker OAuth 2.1 layer (Claude.ai remote MCP)
├── shared-server.ts   # Runtime-neutral shared MCP server construction
├── tools/             # MCP tool implementations (+ co-located *.test.ts)
│   ├── annotations.ts       # Workout annotation tools
│   ├── body-measurements.ts # Body measurement tools
│   ├── folders.ts           # Routine folder tools
│   ├── routines.ts          # Routine management tools
│   ├── templates.ts         # Exercise template tools
│   ├── user.ts              # User profile tools
│   └── workouts.ts          # Workout management tools
├── generated/         # Auto-generated API client (DO NOT EDIT)
│   ├── client/        # Kubb-generated client code
│   └── schemas/       # Zod validation schemas
└── utils/             # Shared helper functions
    ├── tool-helpers.ts    # Type inference utilities (InferToolParams)
    ├── error-handler.ts   # Centralized error handling (withErrorHandling)
    ├── response-formatter.ts # Output schemas, formatting, and MCP responses
    ├── hevyClient.ts      # API client factory
    ├── hevyClientKubb.ts  # Worker-safe native-fetch Kubb client wrapper
    ├── config.ts          # Node.js configuration parsing
    ├── telemetry.ts       # Node-only OpenTelemetry/Sentry setup
    └── stdio-observability.ts # Node-only stdio instrumentation
```

`src/shared-server.ts`, the tool/resource/prompt modules it imports, and the
native-fetch Hevy client must remain safe for both Node.js and Cloudflare
Workers. Keep Node built-ins, stdio transports, process lifecycle handling,
and telemetry/observability wiring behind the Node-only `src/cli.ts` and
`src/index.ts` path. `src/worker.ts` must not import that Node-only path.

### Testing Structure

```
tests/
├── integration/       # Integration tests (require API key)
└── unit tests are co-located with source files (*.test.ts)
```

### Client Architecture

The project uses a generated API client via Kubb that creates:

- TypeScript types in `src/generated/client/types/`
- API methods in `src/generated/client/api/`
- Zod schemas in `src/generated/client/schemas/`
- Mock data in `src/generated/client/mocks/`

### Configuration Files

- `kubb.config.ts` - API client generation configuration
- `oxlint and oxfmt configuration` - Code formatting and linting rules (tabs, 80 char lines, double quotes)
- `lefthook.yml` - Git hooks for pre-commit formatting and commit message linting

## Development Patterns

### Type-Safe Tool Implementation

The project uses **Zod schema inference** for type-safe tool parameters. This eliminates manual type assertions and ensures types match schemas automatically.

#### Pattern: Using Type Inference

**Always** extract Zod schemas and use `InferToolParams` for type safety:

```typescript
import type { InferToolParams } from "../utils/tool-helpers.js";
import { withErrorHandling } from "../utils/error-handler.js";

// 1. Define schema as const
const getRoutinesSchema = {
	page: z.coerce.number().int().gte(1).default(1),
	pageSize: z.coerce.number().int().gte(1).lte(10).default(5),
} as const;

// 2. Infer types from schema
type GetRoutinesParams = InferToolParams<typeof getRoutinesSchema>;

// 3. Use inferred type in handler
server.tool(
	"get-routines",
	"Description...",
	getRoutinesSchema, // Use the schema constant
	withErrorHandling(async (args: GetRoutinesParams) => {
		// args is fully typed - no manual assertions needed!
		const { page, pageSize } = args;
		// ...
	}, "get-routines"),
);
```

**Key Benefits:**

- ✅ Single source of truth (Zod schema defines both validation and types)
- ✅ No manual type assertions (`args as {...}`)
- ✅ Automatic type updates when schemas change
- ✅ Full IDE autocomplete and type checking

**DO NOT:**

- ❌ Use `args as { ... }` type assertions
- ❌ Define parameter types separately from Zod schemas
- ❌ Use `Record<string, unknown>` in handler signatures (use inferred types)

### Adding New MCP Tools

1. **Create new tool file** in `src/tools/`
2. **Define Zod schema** with `as const` assertion
3. **Infer parameter types** using `InferToolParams<typeof schema>`
4. **Implement handler** with typed parameters (no manual assertions)
5. **Wrap with error handling** using `withErrorHandling` from `src/utils/error-handler.ts`
6. **Define and render responses** in `src/utils/response-formatter.ts`,
   co-locating Zod output schemas, raw-to-public normalization, legacy text
   projection, and MCP response assembly
7. **Register tools** in `src/index.ts`
8. **Add unit tests** co-located with implementation

### Working with Generated Code

- **NEVER** edit files in `src/generated/` directly
- Regenerate API client: `npm run build:client`
- If OpenAPI spec changes, refresh `openapi-spec.json` with `npm run openapi` first
- Generated types are available in `src/generated/client/types/index.ts`

### Error Handling

- Use centralized error handling from `src/utils/error-handler.ts`
- Wrap handlers with `withErrorHandling(fn, "context-name")`
- Follow existing error response patterns in tool implementations
- Error responses automatically include `isError: true` flag

## Troubleshooting

### Common Issues

1. **Server won't start:** Check for `HEVY_API_KEY` in `.env` file
2. **Integration tests failing:** Expected without valid API key
3. **TypeScript errors in generated code:** Expected - ignore these
4. **Build failures:** Run `npm run check` to identify formatting/linting issues
5. **Network errors in `npm run openapi`:** Expected in sandboxed environments
6. **Type errors in tool handlers:** Use `InferToolParams<typeof schema>` instead of manual type assertions
7. **Stale webhook references in docs:** Webhook endpoints are not currently
   available in the generated client, so docs should not reference a
   `src/tools/webhooks.ts` tool implementation.

### Performance Expectations

- **Build time:** 3-5 seconds
- **Unit test time:** 1-2 seconds
- **Dependency installation:** 30 seconds
- **API client generation:** 4-5 seconds
- **Type checking:** < 1 second

## Key Utilities Reference

### Type Inference (`src/utils/tool-helpers.ts`)

- **`InferToolParams<T>`**: Infers TypeScript types from Zod schema objects
- **`createTypedToolHandler`**: Optional wrapper for automatic validation (MCP SDK already validates)

### Error Handling (`src/utils/error-handler.ts`)

- **`withErrorHandling<TParams>(fn, context)`**: Wraps handlers with error handling while preserving parameter types
- **`createErrorResponse(error, context?)`**: Creates standardized error responses

### Response Formatting (`src/utils/response-formatter.ts`)

- **`createJsonResponse(data, options?)`**: Creates JSON-formatted MCP responses
- **`createTextResponse(text)`**: Creates text-formatted MCP responses
- **`createEmptyResponse(message)`**: Creates empty responses with messages

---

**Remember:** Always reference these instructions first before searching for additional information or running exploratory commands.
