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
- `npm run check` - Run Biome formatter and linter (auto-fixes issues)
- `npm run check:types` - TypeScript type checking without emitting files
- `npm test` - Run all tests (unit and integration if HEVY_API_KEY is set)

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
- `biome.json` - Code formatting and linting rules (tabs, 80 char lines, double quotes)
- `lefthook.yml` - Git hooks for pre-commit formatting and commit message linting

## Development Workflow

### Code Style
- Uses Biome for formatting/linting with tabs, 80-character lines, double quotes
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