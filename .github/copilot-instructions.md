# Copilot Instructions for hevy-mcp

**ALWAYS follow these instructions first and only fallback to search or additional context if the information here is incomplete or found to be in error.**

## Project Overview
- **hevy-mcp** is a Model Context Protocol (MCP) server for the Hevy Fitness API, enabling AI agents to manage workouts, routines, exercise templates, and folders via the Hevy API.
- The codebase is TypeScript (Node.js v20+), with a clear separation between tool implementations (`src/tools/`), generated API clients (`src/generated/`), and utility logic (`src/utils/`).
- API client code is generated from the OpenAPI spec using [Kubb](https://kubb.dev/). **Do not manually edit generated files.**

## Working Effectively

### Bootstrap and Build Repository
Run these commands in order to set up a working development environment:

1. **Install dependencies:**
   ```bash
   npm ci
   ```
   - Takes approximately 30 seconds. NEVER CANCEL - set timeout to 60+ seconds.

2. **Build the project:**
   ```bash
   npm run build
   ```
   - Takes approximately 3-5 seconds. TypeScript compilation via tsup.
   - Always build before running the server or testing changes.

3. **Run linting/formatting:**
   ```bash
   npm run check
   ```
   - Takes less than 1 second.
   - **EXPECTED WARNING:** Biome schema version mismatch warning is normal and can be ignored.

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
   - Always run this after updating `openapi-spec.json`.

### Server Operations

8. **Development server (with hot reload):**
   ```bash
   npm run dev
   ```
   - **REQUIRES:** Valid `HEVY_API_KEY` in `.env` file or will exit immediately.
   - Server runs indefinitely until stopped.

9. **Production server:**
   ```bash
   npm start
   ```
   - **REQUIRES:** Valid `HEVY_API_KEY` in `.env` file or will exit immediately.
   - Must run `npm run build` first.

## Commands That Do Not Work

### Known Failing Commands
- **`npm run export-specs`**: Fails with network error (`ENOTFOUND api.hevyapp.com`) in sandboxed environments.
- **`npm run check:types`**: Reports 301 TypeScript errors in generated code. This is expected - the project builds successfully despite these errors.
- **`npm run inspect`**: MCP inspector tool - may timeout in environments without proper MCP client setup.

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
- **Required:** Node.js v20+ (specified in `.nvmrc` as v22.14.0)
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
   - Must complete without errors (warnings about Biome schema are acceptable).

4. **MCP tool functionality validation (if API key available):**
   - Start development server: `npm run dev`
   - Test MCP tool endpoints with a client
   - Verify tool responses are correctly formatted

### Critical Validation Notes
- **ALWAYS** run unit tests after any source code changes
- **ALWAYS** run build validation before committing changes
- **DO NOT** attempt to fix TypeScript errors in `src/generated/` - these are auto-generated files
- **DO NOT** commit `.env` files containing real API keys

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
    ├── formatters.ts  # Data formatting helpers
    └── hevyClient.ts  # API client configuration
```

### Testing Structure
```
tests/
├── integration/       # Integration tests (require API key)
└── unit tests are co-located with source files (*.test.ts)
```

## Development Patterns

### Adding New MCP Tools
1. Create new tool file in `src/tools/`
2. Implement tool functions using existing patterns
3. Validate inputs with Zod schemas from `src/generated/schemas/`
4. Format outputs using helpers in `src/utils/formatters.ts`
5. Register tools in `src/index.ts`
6. Add unit tests co-located with implementation

### Working with Generated Code
- **NEVER** edit files in `src/generated/` directly
- Regenerate API client: `npm run build:client`
- If OpenAPI spec changes, update `openapi-spec.json` first

### Error Handling
- Use centralized error handling from `src/utils/error-handler.ts`
- Follow existing error response patterns in tool implementations

## Troubleshooting

### Common Issues
1. **Server won't start:** Check for `HEVY_API_KEY` in `.env` file
2. **Integration tests failing:** Expected without valid API key
3. **TypeScript errors in generated code:** Expected - ignore these
4. **Build failures:** Run `npm run check` to identify formatting/linting issues
5. **Network errors in export-specs:** Expected in sandboxed environments

### Performance Expectations
- **Build time:** 3-5 seconds
- **Unit test time:** 1-2 seconds  
- **Dependency installation:** 30 seconds
- **API client generation:** 4-5 seconds

---

**Remember:** Always reference these instructions first before searching for additional information or running exploratory commands.
