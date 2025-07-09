# Copilot Instructions for hevy-mcp

## Project Overview
- **hevy-mcp** is a Model Context Protocol (MCP) server for the Hevy Fitness API, enabling AI agents to manage workouts, routines, exercise templates, and folders via the Hevy API.
- The codebase is TypeScript (Node.js v20+), with a clear separation between tool implementations (`src/tools/`), generated API clients (`src/generated/`), and utility logic (`src/utils/`).
- API client code is generated from the OpenAPI spec using [Kubb](https://kubb.dev/). Do not manually edit generated files.

## Key Directories & Files
- `src/tools/`: Implements MCP tools (workouts, routines, templates, folders, webhooks). Each file corresponds to a logical tool group.
- `src/generated/`: Contains generated API client, types, schemas, and mocks. Regenerate with `npm run build:client` after updating the OpenAPI spec.
- `src/utils/`: Shared helpers for formatting, validation, and API client logic.
- `tests/integration/`: Integration tests for MCP endpoints, using real API calls (requires `HEVY_API_KEY`).
- `.env`: Store your Hevy API key here (never commit secrets).

## Developer Workflows
- **Install dependencies:** `npm install`
- **Development server:** `npm run dev` (hot reload)
- **Production build:** `npm run build` then `npm start`
- **Run all tests:** `npm test` (unit + integration if `HEVY_API_KEY` is set)
- **Unit tests only:** `npx vitest run --exclude tests/integration/**`
- **Integration tests only:** `npx vitest run tests/integration`
- **Code style/lint:** `npm run check` (uses Biome)
- **Regenerate API client:** `npm run export-specs && npm run build:client`

## Project Conventions & Patterns
- **MCP Tool Pattern:** Each tool is a function in `src/tools/` and should:
  - Validate input using Zod schemas (from `src/generated/schemas/`)
  - Format output using helpers in `src/utils/formatters.ts`
  - Use the generated API client for all Hevy API calls
- **Testing:**
  - Integration tests must validate responses with Zod schemas and avoid debug output in committed code
  - Always re-run tests after changes to source or test files
- **Environment:**
  - All API calls require a valid `HEVY_API_KEY` in `.env`
  - Integration tests will fail if the key is missing (by design)
- **Do not edit generated files** in `src/generated/` directly

## Integration Points
- **Hevy API:** All data flows through the Hevy API via the generated client
- **Smithery/Claude/Cursor:** Can be used as an MCP server for AI assistants (see `README.md` for setup)

## Examples
- To add a new MCP tool, create a new file in `src/tools/`, validate input/output with Zod, and register it in `src/index.ts`
- To update the API contract, edit `openapi-spec.json`, then run `npm run export-specs && npm run build:client`

## References
- See `README.md` for full setup, usage, and workflow details
- See `.cursor/rules/` for project-specific test and integration best practices

---
For questions about unclear conventions or missing documentation, ask for clarification or check recent PRs for examples.
