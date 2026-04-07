# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server for the Hevy fitness tracking API. It provides tools for AI assistants to interact with workouts, routines, exercise templates, folders, and webhook subscriptions through the Hevy API.

## Key Commands

### Development

- `npm run dev` - Start development server with hot reloading
- `npm run build` - Build the project for production
- `npm start` - Run the built project

### Code Quality

- `npm run check` - Run oxlint linter and oxfmt formatter (auto-fixes issues)
- `npm run check:types` - TypeScript type checking without emitting files
- `npm test` - Runs Vitest against all `*.test.ts` files (including `tests/integration/**`). Integration tests will fail by design without `HEVY_API_KEY`. See the "Testing" section in `README.md` for CI requirements and secret configuration.

### API Client Generation

- `npm run export-specs` - Export OpenAPI specification
- `npm run build:client` - Generate API client using Kubb from OpenAPI spec

### Testing Variants

- `npx vitest run --exclude tests/integration/**` - Unit tests only
- `npx vitest run tests/integration` - Integration tests only (requires HEVY_API_KEY)
- `npx vitest run --coverage` - Tests with coverage report

## Architecture

### Core Structure

- **Entry Point**: `src/index.ts` - MCP server setup and tool registration
- **Tools**: `src/tools/` - MCP tool implementations organized by domain:
  - `workouts.ts` - Workout CRUD operations
  - `routines.ts` - Routine management
  - `templates.ts` - Exercise template access
  - `folders.ts` - Routine folder organization
  - `webhooks.ts` - Webhook subscription management
- **Utils**: `src/utils/` - Shared utilities for HTTP client, formatting, and error handling
- **Generated Code**: `src/generated/` - Auto-generated API client from OpenAPI spec

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

## Development Workflow

### Code Style

- Uses oxlint for linting and oxfmt for formatting with tabs, 80-character lines, double quotes
- Excludes generated code (`src/generated/`) from linting
- Pre-commit hooks auto-format staged files

### Testing Strategy

- Unit tests for utilities and core logic
- Integration tests that require real Hevy API access
- Tests run conditionally based on HEVY_API_KEY presence

### Client Regeneration

When API changes occur:

1. Update `openapi-spec.json` with `npm run export-specs`
2. Regenerate client with `npm run build:client`
3. Generated code is automatically formatted via Kubb hooks

## Environment Setup

Required environment variables:

- `HEVY_API_KEY` - Hevy API key (required for server operation and integration tests)

### HTTP+OAuth Transport

The `http+oauth` transport exposes a password-gated OAuth 2.1 authorization server + MCP resource server, compatible with claude.ai Connectors.

Additional environment variables (required for `http+oauth` mode):

- `MCP_ISSUER_URL` - Public base URL of this server (e.g. `https://mcp.example.com`). Also settable via `--issuer-url=URL`.
- `MCP_AUTH_PASSWORD` - Password shown in the consent form; leave empty to reject all logins.
- `OAUTH_DB_PATH` - Path to the SQLite database file (default: `./oauth.db`).

Starting the server:

```bash
MCP_ISSUER_URL=http://localhost:3000 MCP_AUTH_PASSWORD=secret HEVY_API_KEY=xxx \
  node dist/cli.mjs --transport=http+oauth --port=3000
```

Verification:

```bash
# OAuth metadata
curl http://localhost:3000/.well-known/oauth-authorization-server | jq .

# Unauthenticated request should return 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" -d '{}'
```

#### Docker Compose

`Dockerfile.oauth` and `docker-compose.yml` provide a self-contained deployment (port 8012 → 8000 inside container). The existing `Dockerfile` stub (which deliberately errors) and `docker.test.ts` are untouched.

```bash
# Create .env with HEVY_API_KEY, MCP_AUTH_PASSWORD, MCP_ISSUER_URL
docker compose -f docker-compose.yml build
docker compose -f docker-compose.yml up -d
```

## Tool Implementation Pattern

Each MCP tool follows this pattern:

1. Input validation using Zod schemas
2. API call using generated client
3. Response formatting for user consumption
4. Error handling with descriptive messages

The tools are organized by domain and registered in the main server file.

## Tool Requirements

### Documentation and Research

- **Context7**: MUST use Context7 for any library and API documentation needs
- **GitHub Integration**: MUST use the GitHub MCP server for all GitHub interactions and only use `gh` if there is a problem with the personal access token
- **AI Feedback**: MUST ask Gemini for feedback (about a design, code review, etc.) but remember Gemini has no memory so everything must be provided in the prompt and you must refer to files using the @ syntax
