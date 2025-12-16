# hevy-mcp: Model Context Protocol Server for Hevy Fitness API

[![smithery badge](https://smithery.ai/badge/@chrisdoc/hevy-mcp)](https://smithery.ai/server/@chrisdoc/hevy-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server implementation that interfaces with the [Hevy fitness tracking app](https://www.hevyapp.com/) and its [API](https://api.hevyapp.com/docs/). This server enables AI assistants to access and manage workout data, routines, exercise templates, and more through the Hevy API (requires PRO subscription).

## Features

- **Workout Management**: Fetch, create, and update workouts
- **Routine Management**: Access and manage workout routines
- **Exercise Templates**: Browse available exercise templates
- **Folder Organization**: Manage routine folders
- **Webhook Subscriptions**: Create, view, and delete webhook subscriptions for workout events

> **Note:** HTTP transport and Docker images remain deprecated. Smithery deployment now uses the official TypeScript runtime flow (no Docker required), or you can run the server locally via stdio (e.g., `npx hevy-mcp`). Existing GHCR images remain available but are no longer updated.

## Quick start

Pick the workflow that fits your setup:

| Scenario | Command | Requirements |
| --- | --- | --- |
| One-off stdio run | `HEVY_API_KEY=sk_live... npx -y hevy-mcp` | Node.js ≥ 20, Hevy API key |
| Local development | `pnpm install && pnpm run dev` | `.env` with `HEVY_API_KEY`, pnpm via Corepack |
| Smithery playground / deploy | `pnpm run smithery:dev` / `pnpm run smithery:build` | `HEVY_API_KEY`, `SMITHERY_API_KEY` (or `pnpm dlx @smithery/cli login`) |

## Prerequisites

- Node.js (v20 or higher; CI uses the version pinned in `.nvmrc`)
- pnpm (via Corepack)
- A Hevy API key
  - Optional: A Smithery account + API key/login if you plan to deploy via Smithery

## Installation

### Run via npx (recommended)

You can launch the server directly without cloning:

```bash
HEVY_API_KEY=your_hevy_api_key_here npx -y hevy-mcp
```

### Manual Installation
```bash
# Clone the repository
git clone https://github.com/chrisdoc/hevy-mcp.git
cd hevy-mcp

# Install dependencies
corepack use pnpm@10.22.0
pnpm install

# Create .env and add your keys (never commit real keys)
cp .env.sample .env
# Edit .env and add at least HEVY_API_KEY. Add SMITHERY_API_KEY if you use Smithery CLI.
```

### Integration with Cursor

To use this MCP server with Cursor, you need to update your `~/.cursor/mcp.json` file by adding the following configuration:

```json
{
  "mcpServers": {
    "hevy-mcp": {
      "command": "npx",
      "args": ["-y", "hevy-mcp"],
      "env": {
        "HEVY_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Make sure to replace `your-api-key-here` with your actual Hevy API key.


## Configuration

You can supply your Hevy API key in two ways:

1. Environment variable (`HEVY_API_KEY`)
2. Command-line argument (`--hevy-api-key=your_key` or `hevy-api-key=your_key` after `--` when using pnpm scripts)

Create a `.env` file in the project root (you can copy from [.env.sample](.env.sample)) with the following content if using the environment variable approach:

```env
HEVY_API_KEY=your_hevy_api_key_here
```

Replace `your_hevy_api_key_here` with your actual Hevy API key. If you prefer the command argument approach you can skip setting the environment variable and start the server with for example:

```bash
pnpm start -- --hevy-api-key=your_hevy_api_key_here
```

### Sentry monitoring

`hevy-mcp` ships with Sentry monitoring baked into the built MCP server so
that usage and errors from published builds can be observed.

The server initializes `@sentry/node` with a fixed DSN and tracing settings
directly in the code (see `src/index.ts`), and wraps the underlying
`McpServer` with `Sentry.wrapMcpServerWithSentry` so requests and tool calls
are captured by Sentry automatically. The configuration uses
`sendDefaultPii: false` to keep Sentry's default PII collection disabled.

There is currently no built-in toggle to disable Sentry for the published
package. If you need a build without Sentry telemetry, you can fork the
repository and remove the Sentry initialization in `src/index.ts`.

## Transport

### Deploy via Smithery (TypeScript runtime)

Smithery can bundle and host `hevy-mcp` without Docker by importing the exported `createServer` and `configSchema` from `src/index.ts`.

1. Ensure dependencies are installed: `pnpm install`
2. Launch the Smithery playground locally:

   ```bash
   pnpm run smithery:dev
   ```

   The CLI will prompt for `HEVY_API_KEY`, invoke `createServer({ config })`, and open the Smithery MCP playground.

3. Build the deployable bundle:

   ```bash
   pnpm run smithery:build
   ```

4. Connect the repository to Smithery and trigger a deployment from their dashboard. Configuration is handled entirely through the exported Zod schema, so no additional `smithery.yaml` env mapping is required.

> **Why are `chalk`, `cors`, and `@smithery/sdk` dependencies?** Smithery’s TypeScript runtime injects its own Express bootstrap that imports these packages. Declaring them in `package.json` ensures the Smithery CLI can bundle your server successfully.

hevy-mcp now runs exclusively over stdio, which works seamlessly with MCP-aware clients like Claude Desktop and Cursor. HTTP transport has been removed to simplify deployment.

## Usage

### Development

```bash
pnpm run dev
```

This starts the MCP server in development mode with hot reloading.

### Production

```bash
pnpm run build
pnpm start
```

### Docker (deprecated)

Docker-based workflows have been retired so we can focus on the stdio-native experience. The bundled `Dockerfile` now exits with a clear message to prevent accidental builds, and `.dockerignore` simply documents the deprecation. Previously published images remain available on GHCR (for example `ghcr.io/chrisdoc/hevy-mcp:latest`), but they are **no longer updated**. For the best experience, run the server locally via `npx hevy-mcp` or your own Node.js runtime.

## Available MCP Tools

The server implements the following MCP tools for interacting with the Hevy API:

### Workout Tools
- `get-workouts`: Fetch and format workout data
- `get-workout`: Get a single workout by ID
- `create-workout`: Create a new workout
- `update-workout`: Update an existing workout
- `get-workout-count`: Get the total count of workouts
- `get-workout-events`: Get workout update/delete events

### Routine Tools
- `get-routines`: Fetch and format routine data
- `create-routine`: Create a new routine
- `update-routine`: Update an existing routine
- `get-routine-by-id`: Get a single routine by ID using direct endpoint

### Exercise Template Tools
- `get-exercise-templates`: Fetch exercise templates
- `get-exercise-template`: Get a template by ID

### Routine Folder Tools
- `get-routine-folders`: Fetch routine folders
- `create-routine-folder`: Create a new folder
- `get-routine-folder`: Get a folder by ID

### Webhook Tools
- `get-webhook-subscription`: Get the current webhook subscription
- `create-webhook-subscription`: Create a new webhook subscription
- `delete-webhook-subscription`: Delete the current webhook subscription

## Project Structure

```plaintext
hevy-mcp/
├── .env                   # Environment variables (API keys)
├── src/
│   ├── index.ts           # Main entry point
│   ├── tools/             # Directory for MCP tool implementations
│   │   ├── workouts.ts    # Workout-related tools
│   │   ├── routines.ts    # Routine-related tools
│   │   ├── templates.ts   # Exercise template tools
│   │   ├── folders.ts     # Routine folder tools
│   │   └── webhooks.ts    # Webhook subscription tools
│   ├── generated/         # API client (generated code)
│   │   ├── client/        # Kubb-generated client
│   │   │   ├── api/       # API client methods
│   │   │   ├── types/     # TypeScript types
│   │   │   ├── schemas/   # Zod schemas
│   │   │   └── mocks/     # Mock data
│   └── utils/             # Helper utilities
│       ├── config.ts              # Env/CLI config parsing
│       ├── error-handler.ts       # Tool error wrapper + response builder
│       ├── formatters.ts          # Domain formatting helpers
│       ├── hevyClient.ts          # API client factory
│       ├── httpServer.ts          # HTTP transport (removed/deprecated)
│       ├── response-formatter.ts  # MCP response utilities
│       └── tool-helpers.ts        # Zod schema -> TS type inference
├── scripts/               # Build and utility scripts
└── tests/                 # Test suite
    ├── integration/       # Integration tests with real API
    │   └── hevy-mcp.integration.test.ts  # MCP server integration tests
```

## Development Guide

### Code Style

This project uses Biome for code formatting and linting:

```bash
pnpm run check
```

### Testing

#### Run All Tests

To run all tests (unit and integration), use:

```bash
pnpm test
```

> **Note:** `pnpm test` runs **all** tests. Integration tests will fail by design if
> `HEVY_API_KEY` is missing.

#### Run Only Unit Tests

To run only unit tests (excluding integration tests):

```bash
pnpm vitest run --exclude tests/integration/**
```

Or with coverage:

```bash
pnpm vitest run --coverage --exclude tests/integration/**
```

#### Run Only Integration Tests

To run only the integration tests (requires a valid `HEVY_API_KEY`):

```bash
pnpm vitest run tests/integration
```

**Note:** The integration tests will fail if the `HEVY_API_KEY` environment variable is not set. This is by design to ensure that the tests are always run with a valid API key.

##### GitHub Actions Configuration

For GitHub Actions:

1. Unit + integration tests are executed as part of the normal `Build and Test` workflow
2. Integration tests require the `HEVY_API_KEY` secret to be set

To set up the `HEVY_API_KEY` secret:

1. Go to your GitHub repository
2. Click on "Settings" > "Secrets and variables" > "Actions"
3. Click on "New repository secret"
4. Set the name to `HEVY_API_KEY` and the value to your Hevy API key
5. Click "Add secret"

If the secret is not set, the integration tests will fail (by design).

### Generating API Client

The API client is generated from the OpenAPI specification using [Kubb](https://kubb.dev/):

```bash
pnpm run export-specs
pnpm run build:client
```

Kubb generates TypeScript types, API clients, Zod schemas, and mock data from the OpenAPI specification.

### Troubleshooting

- **Rollup optional dependency missing**: If you see an error similar to `Cannot find module @rollup/rollup-linux-x64-gnu`, set the environment variable `ROLLUP_SKIP_NODEJS_NATIVE_BUILD=true` before running `pnpm run build`. This forces Rollup to use the pure JavaScript fallback and avoids the npm optional dependency bug on some Linux runners.

### Troubleshooting Smithery deployments

- **`smithery.yaml` validation failed (unexpected fields)**: Only `runtime`, `target`, and `env` are allowed for the TypeScript runtime. Remove `entry`, `name`, or other fields.
- **`Could not resolve "chalk"/"cors"`**: Run `pnpm install` so the runtime dependencies listed in `package.json` are present before invoking Smithery.
- **`Failed to connect to Smithery API: Unauthorized`**: Log in via `pnpm dlx @smithery/cli login` or set `SMITHERY_API_KEY` in `.env`.
- **Tunnel crashes with `RangeError: Invalid count value`**: This is a known issue in certain `@smithery/cli` builds. Upgrade/downgrade the CLI (e.g., `pnpm add -D @smithery/cli@latest`) or contact Smithery support.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## Acknowledgements

- [Model Context Protocol](https://github.com/modelcontextprotocol) for the MCP SDK
- [Hevy](https://www.hevyapp.com/) for their fitness tracking platform and API
