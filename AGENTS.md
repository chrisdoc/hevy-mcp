# Agent Instructions for hevy-mcp

**ALWAYS follow these instructions first and only fallback to search or additional context if the information here is incomplete or found to be in error.**

## Project Overview
- **hevy-mcp** is a Model Context Protocol (MCP) server for the Hevy Fitness API, enabling AI agents to manage workouts, routines, exercise templates, and folders via the Hevy API.
- The codebase is TypeScript (Node.js v20+), with a clear separation between tool implementations (`src/tools/`), generated API clients (`src/generated/`), and utility logic (`src/utils/`).
- API client code is generated from the OpenAPI spec using [Kubb](https://kubb.dev/). **Do not manually edit generated files.**
- **Type Safety:** The project uses Zod schema inference for type-safe tool parameters, eliminating manual type assertions and ensuring compile-time type safety.

## Working Effectively

### Bootstrap and Build Repository
Run these commands in order to set up a working development environment (Corepack is bundled with Node.js v20+, so run `corepack use pnpm@10.22.0` once per machine if pnpm isn't available):

1. **Install dependencies:**
   ```bash
   pnpm install
   ```
   - Takes approximately 30 seconds. NEVER CANCEL - set timeout to 60+ seconds.

2. **Build the project:**
   ```bash
   pnpm run build
   ```
   - Takes approximately 3-5 seconds. TypeScript compilation via tsup.
   - Always build before running the server or testing changes.

3. **Run linting/formatting:**
   ```bash
   pnpm run check
   ```
   - Takes less than 1 second.
   - **EXPECTED WARNING:** Biome schema version mismatch warning is normal and can be ignored.

### Testing Commands

4. **Run unit tests only:**
   ```bash
   pnpm vitest run --exclude tests/integration/**
   ```
   - Takes approximately 1-2 seconds. NEVER CANCEL.
   - This is the primary testing command for development.

5. **Run integration tests (requires API key):**
   ```bash
   pnpm vitest run tests/integration
   ```
   - **WILL FAIL** without valid `HEVY_API_KEY` in `.env` file (by design).
   - Integration tests require real API access and cannot run in sandboxed environments.

6. **Run all tests:**
   ```bash
   pnpm test
   ```
   - Takes approximately 1-2 seconds for unit tests only (without API key).
   - **WILL FAIL** if `HEVY_API_KEY` is missing due to integration test failure (by design).

### API Client Generation

7. **Regenerate API client from OpenAPI spec:**
   ```bash
   pnpm run build:client
   ```
   - Takes approximately 4-5 seconds. NEVER CANCEL.
   - **EXPECTED WARNINGS:** OpenAPI validation warnings about missing schemas are normal.
   - Always run this after updating `openapi-spec.json`.

### Server Operations

8. **Development server (with hot reload):**
   ```bash
   pnpm run dev
   ```
   - **REQUIRES:** Valid `HEVY_API_KEY` in `.env` file or will exit immediately.
   - Server runs indefinitely until stopped.

9. **Production server:**
   ```bash
   pnpm start
   ```
   - **REQUIRES:** Valid `HEVY_API_KEY` in `.env` file or will exit immediately.
   - Must run `pnpm run build` first.

## Commands That Do Not Work

### Known Failing Commands
- **`pnpm run export-specs`**: Fails with network error (`ENOTFOUND api.hevyapp.com`) in sandboxed environments.
- **`pnpm run inspect`**: MCP inspector tool - may timeout in environments without proper MCP client setup.

## Environment Setup

### Required Environment Variables
Create a `.env` file in the project root with:
```env
HEVY_API_KEY=your_hevy_api_key_here
```

**CRITICAL:** Without this API key:
- Servers will not start
- Integration tests will fail (by design)
- API client functionality cannot be tested

### Node.js Version
- **Required:** Node.js v20+ (CI uses the version pinned in `.nvmrc`)
- Use `node --version` to verify current version

## Validation After Changes

### Manual Testing Scenarios
Always perform these validation steps after making changes:

1. **Build validation:**
   ```bash
   pnpm run build
   ```
   - Must complete successfully without errors.

2. **Unit test validation:**
   ```bash
   pnpm vitest run --exclude tests/integration/**
   ```
   - All unit tests must pass.

3. **Code style validation:**
   ```bash
   pnpm run check
   ```
   - Must complete without errors (warnings about Biome schema are acceptable).
   - **EXPECTED:** Warnings about `any` usage in `webhooks.ts` are acceptable (API methods not yet available).

4. **Type checking validation:**
   ```bash
   pnpm run check:types
   ```
   - Must complete without errors.
   - Verifies all type inference is working correctly.

5. **MCP tool functionality validation (if API key available):**
   - Start development server: `pnpm run dev`
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
├── index.ts           # Main entry point - register tools here
├── tools/             # MCP tool implementations
│   ├── workouts.ts    # Workout management tools
│   ├── routines.ts    # Routine management tools
│   ├── templates.ts   # Exercise template tools
│   ├── folders.ts     # Routine folder tools
│   └── webhooks.ts    # Webhook subscription tools
├── generated/         # Auto-generated API client (DO NOT EDIT)
│   ├── client/        # Kubb-generated client code
│   └── schemas/       # Zod validation schemas
└── utils/             # Shared helper functions
    ├── tool-helpers.ts    # Type inference utilities (InferToolParams)
    ├── error-handler.ts   # Centralized error handling (withErrorHandling)
    ├── response-formatter.ts # MCP response utilities
    ├── formatters.ts      # Data formatting helpers
    ├── hevyClient.ts      # API client factory
    ├── hevyClientKubb.ts  # Kubb client wrapper
    ├── config.ts          # Configuration parsing
    └── httpServer.ts      # HTTP server utilities (deprecated)
```

### Testing Structure
```
tests/
├── integration/       # Integration tests (require API key)
└── unit tests are co-located with source files (*.test.ts)
```

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
  getRoutinesSchema,  // Use the schema constant
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
6. **Format outputs** using helpers in `src/utils/formatters.ts`
7. **Register tools** in `src/index.ts`
8. **Add unit tests** co-located with implementation

### Working with Generated Code
- **NEVER** edit files in `src/generated/` directly
- Regenerate API client: `pnpm run build:client`
- If OpenAPI spec changes, update `openapi-spec.json` first
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
4. **Build failures:** Run `pnpm run check` to identify formatting/linting issues
5. **Network errors in export-specs:** Expected in sandboxed environments
6. **Type errors in tool handlers:** Use `InferToolParams<typeof schema>` instead of manual type assertions
7. **Linter warnings about `any`:** Expected in `webhooks.ts` where API methods don't exist yet (see TODOs)

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
