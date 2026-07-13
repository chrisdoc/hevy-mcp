# hevy-mcp: Hevy workouts for your AI assistant

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Build and Test](https://github.com/chrisdoc/hevy-mcp/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/chrisdoc/hevy-mcp/actions/workflows/build-and-test.yml)
[![Codecov](https://codecov.io/gh/chrisdoc/hevy-mcp/branch/main/graph/badge.svg)](https://codecov.io/gh/chrisdoc/hevy-mcp)
[![npm version](https://img.shields.io/npm/v/hevy-mcp.svg)](https://www.npmjs.com/package/hevy-mcp)

`hevy-mcp` connects MCP-compatible assistants such as Claude Desktop and Cursor
to the [Hevy](https://www.hevyapp.com/) fitness API. Ask about workout history,
analyze progress, browse routines and exercises, or create and update Hevy data
without leaving your assistant.

A Hevy API key, available with Hevy PRO, is required.

## Quick Start

Use local stdio when your MCP client can launch a command. Hosted Streamable
HTTP setup is documented below but is temporarily unavailable.

### Option A: Local stdio

The npm package and official container are **stdio-only** MCP executables. Your
client starts the process and communicates through standard input/output; this
is not an interactive terminal command or an HTTP service.

#### npx

Requires Node.js 20 or newer, as declared by the package metadata.

Claude Desktop (`claude_desktop_config.json`) and Cursor (`~/.cursor/mcp.json`)
both accept an `mcpServers` entry like this:

- **Claude Desktop on macOS:**
  `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Desktop on Windows:**
  `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
	"mcpServers": {
		"hevy": {
			"command": "npx",
			"args": ["-y", "hevy-mcp"],
			"env": {
				"HEVY_API_KEY": "your-hevy-api-key"
			}
		}
	}
}
```

#### bunx

Requires [Bun](https://bun.sh/). Use the same client configuration with a Bun
launcher:

```json
{
	"mcpServers": {
		"hevy": {
			"command": "bunx",
			"args": ["hevy-mcp@latest"],
			"env": {
				"HEVY_API_KEY": "your-hevy-api-key"
			}
		}
	}
}
```

#### Docker

Official images support `linux/amd64` and `linux/arm64`. Keep stdin open with
`-i` because the container runs the same stdio server:

```bash
export HEVY_API_KEY=your-hevy-api-key
docker run -i --rm -e HEVY_API_KEY ghcr.io/chrisdoc/hevy-mcp:latest
```

For an MCP client, store the key in a protected environment file and configure
the client to launch Docker:

```json
{
	"mcpServers": {
		"hevy": {
			"command": "docker",
			"args": [
				"run",
				"-i",
				"--rm",
				"--env-file",
				"/absolute/path/to/hevy-mcp.env",
				"ghcr.io/chrisdoc/hevy-mcp:latest"
			]
		}
	}
}
```

Pin an exact image tag such as `ghcr.io/chrisdoc/hevy-mcp:X.Y.Z` when you need
reproducible upgrades.

You can also add the local npm server to supported clients with
[`add-mcp`](https://github.com/neon-solutions/add-mcp):

```bash
npx add-mcp hevy-mcp --env "HEVY_API_KEY=your-hevy-api-key"
```

### Option B: Hosted Streamable HTTP — temporarily unavailable

> [!WARNING]
> `https://hevy.chrisdoc.dev/mcp` is currently intercepted by an interactive
> Cloudflare challenge, so non-browser MCP clients cannot connect. Use local
> stdio until the route is restored.

When available, the hosted endpoint does not require Node.js, Bun, or Docker:

```text
https://hevy.chrisdoc.dev/mcp
```

Configure a remote MCP server in your client and send your Hevy API key as a
fixed authorization header. Exact configuration keys vary by client; clients
that use `url` and `headers` commonly accept this shape:

```json
{
	"mcpServers": {
		"hevy": {
			"url": "https://hevy.chrisdoc.dev/mcp",
			"headers": {
				"Authorization": "Bearer your-hevy-api-key"
			}
		}
	}
}
```

The hosted transport is stateless **Streamable HTTP** at `POST /mcp`. The bearer
value is a custom Hevy API credential, not OAuth. The endpoint does not expose a
legacy SSE or `GET` event stream, and `GET` and `DELETE` requests return `405`.
Clients that require OAuth discovery, dynamic registration, token refresh, or a
legacy SSE transport are not compatible unless they can send the fixed custom
header above.

### How to verify it is working

Restart or reconnect your MCP client after saving the configuration, then try:

- "What routines do I have saved on Hevy?"
- "Show my most recent workouts."
- "Which Hevy account is connected?"
- "Find exercise templates containing squat."

The assistant should ask for approval before mutation tools when the client
supports tool confirmations.

## Guided MCP prompts

These server-provided prompts coordinate multiple tools for common workflows:

| Prompt                        | Arguments                                  | Workflow                                                                                                                                                        |
| ----------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analyze-workout-progress`    | Optional `weeks` from 1-12; default is `4` | Paginates through recent workouts and body measurements, then analyzes frequency, volume, variety, consistency, and measurement trends from retrieved evidence. |
| `create-workout-from-routine` | Required `routineId` and UTC `startTime`   | Loads a routine, asks for actual completed-set data and an end time, then creates a workout without inventing results or copying unsupported routine-only data. |

> [!IMPORTANT]
> With MCP SDK v1.29.0, invoking `analyze-workout-progress` with its default
> `weeks` value requires clients to send `arguments: {}`. Omitting the entire
> `arguments` object is rejected by that SDK version before the default is
> applied.

## Capabilities

`hevy-mcp` registers 23 tools:

| Category                   | Tool                        | Description                                                           |
| -------------------------- | --------------------------- | --------------------------------------------------------------------- |
| Workouts                   | `get-workouts`              | List workouts from newest to oldest with exercise and timing details. |
| Workouts                   | `get-workout`               | Get complete details for one workout by ID.                           |
| Workouts                   | `get-workout-count`         | Return the account's total workout count.                             |
| Workouts                   | `get-workout-events`        | List workout update and delete events since a timestamp.              |
| Workouts                   | `create-workout`            | Create a completed workout in Hevy.                                   |
| Workouts                   | `update-workout`            | Replace an existing workout by ID.                                    |
| Routines                   | `get-routines`              | List custom and default workout routines.                             |
| Routines                   | `get-routine`               | Get one routine and its exercise configuration by ID.                 |
| Routines                   | `create-routine`            | Create a reusable workout routine.                                    |
| Routines                   | `update-routine`            | Replace an existing routine's content.                                |
| Routine folders            | `get-routine-folders`       | List default and custom routine folders.                              |
| Routine folders            | `get-routine-folder`        | Get one routine folder's metadata by ID.                              |
| Routine folders            | `create-routine-folder`     | Create a routine folder.                                              |
| Exercise templates/history | `get-exercise-templates`    | List exercise templates with equipment and muscle metadata.           |
| Exercise templates/history | `get-exercise-template`     | Get complete metadata for one exercise template by ID.                |
| Exercise templates/history | `search-exercise-templates` | Search the full exercise catalog by title substring.                  |
| Exercise templates/history | `create-exercise-template`  | Create a custom exercise template.                                    |
| Exercise templates/history | `get-exercise-history`      | Get past performed sets for one exercise template.                    |
| Body measurements          | `get-body-measurements`     | List dated body measurements.                                         |
| Body measurements          | `get-body-measurement`      | Get the body measurement entry for one date.                          |
| Body measurements          | `create-body-measurement`   | Create a dated body measurement.                                      |
| Body measurements          | `update-body-measurement`   | Update the body measurement for an existing date.                     |
| Account                    | `get-user-info`             | Return the user's ID, display name, and public profile URL.           |

The Hevy API currently exposes no delete endpoints for workouts, routines,
routine folders, exercise templates, or body measurements, so there are no
corresponding delete tools.

### Resources

| Name                 | URI                         | Description                                  |
| -------------------- | --------------------------- | -------------------------------------------- |
| `user-profile`       | `hevy://user`               | Authenticated Hevy user profile.             |
| `workout-count`      | `hevy://workout-count`      | Total number of workouts in the account.     |
| `exercise-templates` | `hevy://exercise-templates` | Full formatted exercise template catalog.    |
| `routine-folders`    | `hevy://routine-folders`    | Full formatted list of Hevy routine folders. |

## Advanced configuration

| Setting                | Default                        | Scope                         | Notes                                                                                                                                   |
| ---------------------- | ------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `HEVY_API_KEY`         | None; required                 | Local stdio                   | Hevy API key from the Hevy app. Use the hosted `Authorization` header instead for Streamable HTTP. Never pass the key in a URL.         |
| `HEVY_MCP_API_TIMEOUT` | `30000` ms                     | Local stdio                   | Positive Hevy API request timeout in milliseconds. Invalid or non-positive values fall back to 30,000 ms.                               |
| `HEVY_MCP_DEBUG`       | Disabled                       | Local stdio                   | Only the exact value `1` enables privacy-bounded diagnostics on stderr. Stdout stays reserved for MCP JSON-RPC.                         |
| `MCP_ALLOWED_ORIGINS`  | No browser origins allowed     | Self-hosted Cloudflare Worker | Optional comma-separated exact origins. Wildcards are unsupported. Requests without `Origin`, such as desktop clients, remain accepted. |
| `XDG_CACHE_HOME`       | `~/.cache`                     | Local stdio                   | Changes the root for the best-effort npm version-check cache at `hevy-mcp/update-check.json`.                                           |
| `SENTRY_DSN`           | Packaged project DSN           | Optional local Node telemetry | Overrides the Sentry destination. An empty value disables Sentry export. The Worker entry point does not import Node telemetry.         |
| `SENTRY_RELEASE`       | `hevy-mcp@<installed-version>` | Optional local Node telemetry | Overrides the release label attached to local Sentry events and traces.                                                                 |
| `-h`, `--help`         | N/A                            | Local stdio CLI               | Print supported options and exit without starting the server.                                                                           |
| `-v`, `--version`      | N/A                            | Local stdio CLI               | Print the installed version and exit without starting the server.                                                                       |

The local executable does **not** support `PORT`, `HEVY_MCP_TRANSPORT`, or
`--transport`. It always uses stdio and does not provide local HTTP or SSE
behavior. Use the hosted endpoint after its route is restored, or deploy the
separate Cloudflare Worker when Streamable HTTP is required now.

## Cache behavior

`search-exercise-templates` and `hevy://exercise-templates` share a
server-scoped in-memory catalog cache:

- Entries live for five minutes and the cache holds at most one catalog.
- Concurrent catalog requests share an in-flight fetch when possible.
- `search-exercise-templates` accepts `refresh: true` to invalidate the cache.
- Paginated `get-exercise-templates` calls always fetch their requested page.
- Each hosted Worker request gets a fresh cache, preventing cross-key sharing.

## Security and mutations

- Keep `HEVY_API_KEY` out of source control, URLs, logs, and screenshots.
- Local clients provide the key through the child process environment. Hosted
  clients send it only in `Authorization: Bearer <HEVY_API_KEY>`.
- The hosted Worker validates each key with Hevy, does not store it, and sends
  it upstream only as Hevy's `api-key` header.
- Browser requests to a self-hosted Worker must exactly match an origin in
  `MCP_ALLOWED_ORIGINS`; wildcard CORS is intentionally unsupported.
- Create operations can produce duplicates when retried. Update operations
  replace existing records. Review tool inputs and use client confirmations.

## Contributing and self-hosting

Developer setup, testing lanes, generated-client workflows, Cloudflare Worker
deployment, and pull request rules live in the
[contributor guide](https://github.com/chrisdoc/hevy-mcp/blob/main/CONTRIBUTING.md).

## License and acknowledgements

- **License:** [MIT](./LICENSE)
- **Credits:** [Model Context Protocol](https://github.com/modelcontextprotocol)
  and [Hevy Fitness](https://www.hevyapp.com/)
