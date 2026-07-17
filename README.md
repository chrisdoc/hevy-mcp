# Hevy MCP Server

<div align="center">

**Talk to your Hevy workout data from Claude, Cursor, Codex, and other MCP clients.**

[![npm version](https://img.shields.io/npm/v/hevy-mcp.svg)](https://www.npmjs.com/package/hevy-mcp)
[![npm downloads](https://img.shields.io/npm/dm/hevy-mcp.svg)](https://www.npmjs.com/package/hevy-mcp)
[![Build and Test](https://github.com/chrisdoc/hevy-mcp/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/chrisdoc/hevy-mcp/actions/workflows/build-and-test.yml)
[![Codecov](https://codecov.io/gh/chrisdoc/hevy-mcp/branch/main/graph/badge.svg)](https://codecov.io/gh/chrisdoc/hevy-mcp)
[![GitHub stars](https://img.shields.io/github/stars/chrisdoc/hevy-mcp?style=flat)](https://github.com/chrisdoc/hevy-mcp/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

[Watch the 18-second demo](https://raw.githubusercontent.com/chrisdoc/hevy-mcp/main/docs/assets/hevy-mcp-demo.mp4) · [Quick start](#quick-start) · [Explore all 25 tools](#tools)

</div>

`hevy-mcp` is an open-source [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
server for the [Hevy](https://www.hevyapp.com/) fitness and workout tracking
app. It lets AI assistants read, analyze, create, and update your Hevy workouts,
routines, exercise templates, and body measurements through authenticated Hevy
API requests.

> A Hevy API key, available with **Hevy PRO**, is required.

## See it in action

[![Hevy MCP demo showing an AI assistant analyzing six weeks of Hevy training data](https://raw.githubusercontent.com/chrisdoc/hevy-mcp/main/docs/assets/hevy-mcp-demo.gif)](https://raw.githubusercontent.com/chrisdoc/hevy-mcp/main/docs/assets/hevy-mcp-demo.mp4)

<p align="center"><sub>Click the preview to play the full-quality 18-second demo.</sub></p>

In the demo, the assistant retrieves real Hevy data and answers a multi-part
training question with evidence from the user's workout history.

## What can you do with it?

- **Analyze training progress:** summarize 1-12 weeks of workouts and body
  measurements in one tool call.
- **Ask questions in plain language:** find recent sessions, frequently trained
  exercises, consistency gaps, routine details, or exercise history.
- **Plan and log training:** create or update workouts, routines, routine folders,
  custom exercises, and body measurements.
- **Search without huge responses:** discover routines and exercise templates with
  compact, AI-friendly results.
- **Use your preferred MCP client:** run it with Codex, Claude Desktop, Cursor,
  or any client that supports stdio MCP servers.
- **Start without installing a package globally:** launch the latest release with
  `npx`, `bunx`, or the official Docker image.

Try asking:

> Analyze my training over the last six weeks. Show workouts per week, my most
> frequently trained exercises, any obvious gaps or inconsistencies, and cite the
> workout evidence you used.

> Find my push-day routine and show its exercises and sets.

> Compare my recent body measurements with my training consistency.

> Create a completed workout from my saved routine. Ask me for any missing set
> results before writing it to Hevy.

## Quick start

### 1. Get your Hevy API key

Create an API key in Hevy, then keep it somewhere secure. API access currently
requires a Hevy PRO subscription.

### 2. Connect `hevy-mcp` to your client

Choose the client you use. The local server communicates over stdio and sends
requests directly to the Hevy API.

#### Codex

Codex CLI, the Codex desktop app, and the IDE extension share the same MCP
configuration. Add the server from a terminal:

```bash
codex mcp add hevy \
  --env HEVY_API_KEY=your-hevy-api-key \
  -- npx -y hevy-mcp
```

This stores the key in your user-local Codex MCP configuration. Then restart
Codex or begin a new session. Run `codex mcp list` to verify that the server is
configured.

#### Claude Desktop or Cursor

Add this `mcpServers` entry to your client configuration:

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

Common configuration locations:

- **Claude Desktop on macOS:**
  `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Desktop on Windows:**
  `%APPDATA%\Claude\claude_desktop_config.json`
- **Cursor:** `~/.cursor/mcp.json`

Restart or reconnect the client after saving the file.

#### Any stdio MCP client

Configure your client to launch this command with `HEVY_API_KEY` in the child
process environment:

```bash
npx -y hevy-mcp
```

`npx` requires Node.js 20 or newer.

<details>
<summary><strong>Use bunx instead</strong></summary>

Requires [Bun](https://bun.sh/):

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

</details>

<details>
<summary><strong>Use Docker instead</strong></summary>

Official images support `linux/amd64` and `linux/arm64`. Keep stdin open with
`-i` because the container runs the stdio MCP server:

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

</details>

You can also add the npm server to supported clients with
[`add-mcp`](https://github.com/neon-solutions/add-mcp):

```bash
npx add-mcp hevy-mcp --env "HEVY_API_KEY=your-hevy-api-key"
```

### 3. Ask your first question

Try one of these after restarting or reconnecting your MCP client:

- “Give me a training summary for the last four weeks.”
- “What routines do I have saved on Hevy?”
- “Show my three most recent workouts.”
- “Find exercise templates containing squat.”
- “Which Hevy account is connected?”

Your assistant should ask for approval before mutation tools when the client
supports tool confirmations.

## How it works

```text
Your AI assistant  →  MCP over stdio  →  hevy-mcp  →  Hevy API
```

The local server runs on your machine. Your MCP client provides the API key to
the child process, and `hevy-mcp` uses it only to authenticate requests to Hevy.
Read tools retrieve data; mutation tools create or replace data only when your
assistant calls them.

## Guided prompts

These server-provided MCP prompts coordinate common multi-step workflows:

| Prompt                        | Arguments                                | Workflow                                                                                                               |
| ----------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `analyze-workout-progress`    | Optional `weeks` from 1-12; default `4`  | Calls `get-training-summary`, then analyzes workout activity and body-measurement trends from the returned evidence.   |
| `create-workout-from-routine` | Required `routineId` and UTC `startTime` | Loads a routine, collects actual completed-set data and an end time, then creates a workout without inventing results. |

> [!NOTE]
> With MCP SDK v1.29.0, clients invoking `analyze-workout-progress` with its
> default value must send `arguments: {}`. Omitting the entire `arguments`
> object is rejected by that SDK version before the default is applied.

## Tools

`hevy-mcp` registers 25 tools. Read-only tools are safe for exploration; create
and update tools are exposed with MCP mutation annotations so compatible clients
can request confirmation.

| Category           | Tool                        | Description                                                                       |
| ------------------ | --------------------------- | --------------------------------------------------------------------------------- |
| Training analysis  | `get-training-summary`      | Summarize 1-12 weeks of workout activity and body-measurement trends in one call. |
| Workouts           | `get-workouts`              | List workouts from newest to oldest with exercise and timing details.             |
| Workouts           | `get-workout`               | Get complete details for one workout by ID.                                       |
| Workouts           | `get-workout-count`         | Return the account's total workout count.                                         |
| Workouts           | `get-workout-events`        | List workout update and delete events since a timestamp.                          |
| Workouts           | `create-workout`            | Create a completed workout in Hevy.                                               |
| Workouts           | `update-workout`            | Replace an existing workout by ID.                                                |
| Routines           | `search-routines`           | Search routine titles and return compact metadata for discovery.                  |
| Routines           | `get-routines`              | List custom and default workout routines.                                         |
| Routines           | `get-routine`               | Get one routine and its exercise configuration by ID.                             |
| Routines           | `create-routine`            | Create a reusable workout routine.                                                |
| Routines           | `update-routine`            | Replace an existing routine's content.                                            |
| Routine folders    | `get-routine-folders`       | List default and custom routine folders.                                          |
| Routine folders    | `get-routine-folder`        | Get one routine folder's metadata by ID.                                          |
| Routine folders    | `create-routine-folder`     | Create a routine folder.                                                          |
| Exercise templates | `get-exercise-templates`    | List exercise templates with equipment and muscle metadata.                       |
| Exercise templates | `get-exercise-template`     | Get complete metadata for one exercise template by ID.                            |
| Exercise templates | `search-exercise-templates` | Search the full exercise catalog by title substring.                              |
| Exercise templates | `create-exercise-template`  | Create a custom exercise template.                                                |
| Exercise history   | `get-exercise-history`      | Get past performed sets for one exercise template.                                |
| Body measurements  | `get-body-measurements`     | List dated body measurements.                                                     |
| Body measurements  | `get-body-measurement`      | Get the body measurement entry for one date.                                      |
| Body measurements  | `create-body-measurement`   | Create a dated body measurement.                                                  |
| Body measurements  | `update-body-measurement`   | Update the body measurement for an existing date.                                 |
| Account            | `get-user-info`             | Return the user's ID, display name, and public profile URL.                       |

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

## Hosted and self-hosted HTTP

> [!WARNING]
> The hosted endpoint at `https://hevy.chrisdoc.dev/mcp` is temporarily
> unavailable because an interactive Cloudflare challenge prevents non-browser
> MCP clients from connecting. Use local stdio until the route is restored.

When available, the hosted endpoint uses stateless **Streamable HTTP** at
`POST /mcp`. Clients must send their Hevy API key as a fixed authorization
header:

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

The bearer value is a custom Hevy credential, not OAuth. The endpoint does not
expose legacy SSE or a `GET` event stream. Clients that require OAuth discovery,
dynamic registration, token refresh, or legacy SSE are not compatible unless
they can send the fixed custom header above.

See [CONTRIBUTING.md](./CONTRIBUTING.md) to deploy the Cloudflare Worker for
self-hosted Streamable HTTP.

## Advanced configuration

| Setting                | Default                        | Scope                         | Notes                                                                                                                                   |
| ---------------------- | ------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `HEVY_API_KEY`         | None; required                 | Local stdio                   | Hevy API key from the Hevy app. Never pass it in a URL.                                                                                 |
| `HEVY_MCP_API_TIMEOUT` | `30000` ms                     | Local stdio                   | Positive Hevy API timeout in milliseconds. Invalid values fall back to 30 seconds.                                                      |
| `HEVY_MCP_DEBUG`       | Disabled                       | Local stdio                   | Set to exactly `1` for privacy-bounded diagnostics on stderr. Stdout remains reserved for MCP JSON-RPC.                                 |
| `MCP_ALLOWED_ORIGINS`  | No browser origins allowed     | Self-hosted Worker            | Optional comma-separated exact origins. Wildcards are unsupported. Requests without `Origin`, such as desktop clients, remain accepted. |
| `XDG_CACHE_HOME`       | `~/.cache`                     | Local stdio                   | Changes the root for the npm update-check cache at `hevy-mcp/update-check.json`.                                                        |
| `SENTRY_DSN`           | Packaged project DSN           | Optional local Node telemetry | Overrides the Sentry destination. An empty value disables Sentry export. The Worker does not import Node telemetry.                     |
| `SENTRY_RELEASE`       | `hevy-mcp@<installed-version>` | Optional local Node telemetry | Overrides the release label attached to local Sentry events and traces.                                                                 |
| `-h`, `--help`         | N/A                            | Local stdio CLI               | Print supported options and exit.                                                                                                       |
| `-v`, `--version`      | N/A                            | Local stdio CLI               | Print the installed version and exit.                                                                                                   |

The local executable is stdio-only. It does not support `PORT`,
`HEVY_MCP_TRANSPORT`, or `--transport`, and it does not provide local HTTP or
SSE behavior.

### Cache behavior

`search-exercise-templates` and `hevy://exercise-templates` share a
server-scoped in-memory catalog cache:

- Entries live for five minutes, and the cache holds at most one catalog.
- Concurrent catalog requests share an in-flight fetch when possible.
- `search-exercise-templates` accepts `refresh: true` to invalidate the cache.
- Paginated `get-exercise-templates` calls always fetch their requested page.
- Each hosted Worker request gets a fresh cache, preventing cross-key sharing.

## Security and mutations

- Keep `HEVY_API_KEY` out of source control, URLs, logs, and screenshots.
- Local clients provide the key through the child process environment.
- The hosted Worker validates each key with Hevy, does not store it, and sends
  it upstream only as Hevy's `api-key` header.
- Browser requests to a self-hosted Worker must exactly match an origin in
  `MCP_ALLOWED_ORIGINS`; wildcard CORS is intentionally unsupported.
- Create operations can produce duplicates when retried. Update operations
  replace existing records. Review tool inputs and use client confirmations.

## Troubleshooting

- **The server does not appear:** restart or reconnect your MCP client after
  changing its configuration.
- **`npx` fails:** confirm that Node.js 20 or newer is installed, then run
  `npx -y hevy-mcp --version` in a terminal.
- **Codex cannot see the server:** run `codex mcp list`, then start a new Codex
  session after confirming the `hevy` entry exists.
- **Authentication fails:** confirm the key is active, belongs to a Hevy PRO
  account, and is available to the MCP child process as `HEVY_API_KEY`.
- **Need diagnostics:** set `HEVY_MCP_DEBUG=1`. Diagnostic output goes to stderr
  and does not interfere with MCP messages on stdout.

If you find a bug or have a feature request, [open an issue](https://github.com/chrisdoc/hevy-mcp/issues).

## Contributing

Contributions are welcome. Developer setup, testing lanes, generated-client
workflows, Cloudflare Worker deployment, and pull request rules are documented
in [CONTRIBUTING.md](./CONTRIBUTING.md).

## License and acknowledgements

- **License:** [MIT](./LICENSE)
- **Credits:** [Model Context Protocol](https://github.com/modelcontextprotocol)
  and [Hevy Fitness](https://www.hevyapp.com/)
