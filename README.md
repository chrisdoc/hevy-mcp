# Hevy MCP Server

<div align="center">

**Talk to your Hevy workout data from Claude, Cursor, Codex, and other MCP clients.**

[![npm version](https://img.shields.io/npm/v/hevy-mcp.svg)](https://www.npmjs.com/package/hevy-mcp)
[![npm downloads](https://img.shields.io/npm/dm/hevy-mcp.svg)](https://www.npmjs.com/package/hevy-mcp)
[![Build and Test](https://github.com/chrisdoc/hevy-mcp/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/chrisdoc/hevy-mcp/actions/workflows/build-and-test.yml)
[![Codecov](https://codecov.io/gh/chrisdoc/hevy-mcp/branch/main/graph/badge.svg)](https://codecov.io/gh/chrisdoc/hevy-mcp)
[![GitHub stars](https://img.shields.io/github/stars/chrisdoc/hevy-mcp?style=flat)](https://github.com/chrisdoc/hevy-mcp/stargazers)
[![Hosted on Cloudflare](https://img.shields.io/badge/Hosted_on-Cloudflare-F38020?logo=cloudflare&logoColor=white)](#hosted-cloudflare-endpoint)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

[Connect to the hosted MCP](#connect-to-the-hosted-endpoint) · [Watch the 18-second demo](https://raw.githubusercontent.com/chrisdoc/hevy-mcp/main/docs/assets/hevy-mcp-demo.mp4) · [Explore all 25 tools](#tools)

</div>

`hevy-mcp` is an open-source [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
server for the [Hevy](https://www.hevyapp.com/) fitness and workout tracking
app. It lets AI assistants read, analyze, create, and update your Hevy workouts,
routines, exercise templates, and body measurements through authenticated Hevy
API requests.

The repository is organized as a private workspace with explicit runtime
boundaries: `@hevy-mcp/hevy-client` owns the web-safe Hevy client,
`@hevy-mcp/core` owns MCP tools and server construction, `hevy-mcp` is the
published Node.js stdio adapter, and `@hevy-mcp/worker` is the private
Cloudflare HTTP/OAuth adapter. Only the Node workspace is publishable.

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
- **Connect from your preferred MCP client:** use the hosted Streamable HTTP
  endpoint or run locally with Codex, Claude Desktop, Cursor, and other clients.
- **Start without installing anything:** connect directly to the production
  Cloudflare Worker—no Node.js, package download, or Docker container required.
- **Keep local control when you want it:** run the same server with `npx`, `bunx`,
  or the official Docker image.

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

The hosted Cloudflare endpoint is the fastest way to start. It runs remotely,
so your client does not need Node.js, Bun, Docker, or a local server process.

#### Connect to the hosted endpoint

Production URL:

```text
https://hevy.chrisdoc.dev/mcp
```

The endpoint uses Streamable HTTP. Send your Hevy API key as a bearer token on
every request.

##### Codex

Codex CLI, the Codex desktop app, and the IDE extension share the same MCP
configuration. Make your Hevy API key available in the environment that starts
Codex, then add the hosted server:

```bash
export HEVY_API_KEY=your-hevy-api-key
codex mcp add hevy \
  --url https://hevy.chrisdoc.dev/mcp \
  --bearer-token-env-var HEVY_API_KEY
```

Codex stores the environment variable name, not the key itself, in its MCP
configuration. Restart Codex or begin a new session, then run `codex mcp list`
to verify the server is configured.

##### Other Streamable HTTP clients

Clients that accept a remote MCP URL and fixed headers commonly use this shape:

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

Exact configuration keys vary by client. The hosted server requires support for
Streamable HTTP and a fixed `Authorization` header.

> [!IMPORTANT]
> Treat the bearer value like a password. The Worker validates it with Hevy for
> each request, does not store it, and forwards it to Hevy only as the required
> `api-key` header.

#### Run locally instead

Choose local stdio if you prefer to run the server on your own machine or your
client cannot attach a fixed authorization header to remote MCP requests.

##### Codex

```bash
codex mcp add hevy \
  --env HEVY_API_KEY=your-hevy-api-key \
  -- npx -y hevy-mcp
```

##### Claude Desktop or Cursor

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

Common local configuration locations:

- **Claude Desktop on macOS:**
  `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Desktop on Windows:**
  `%APPDATA%\Claude\claude_desktop_config.json`
- **Cursor:** `~/.cursor/mcp.json`

Restart or reconnect the client after saving the file.

##### Any stdio MCP client

Configure your client to launch this command with `HEVY_API_KEY` in the child
process environment:

```bash
npx -y hevy-mcp
```

`npx` requires Node.js 20 or newer. Restart or reconnect your client after
saving its configuration.

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
Hosted:  Your AI assistant  →  Streamable HTTP  →  Cloudflare Worker  →  Hevy API
Local:   Your AI assistant  →  MCP over stdio   →  local hevy-mcp     →  Hevy API
```

The hosted endpoint creates a fresh MCP server and Hevy client for each request.
It validates the supplied key with Hevy, keeps no shared user session, and does
not persist the key. The local server follows the same tool contract but runs on
your machine and receives the key through its child-process environment.

In either mode, read tools retrieve data; mutation tools create or replace data
only when your assistant calls them.

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

## Hosted Cloudflare endpoint

The production MCP server is live at:

```text
https://hevy.chrisdoc.dev/mcp
```

It is the quickest way to use `hevy-mcp`: there is nothing to install or keep
running locally, and it exposes the same 25 tools as the npm package and Docker
image.

The Cloudflare Worker uses stateless **Streamable HTTP** at `POST /mcp`.
Clients must send their Hevy API key as a fixed authorization header:

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

The bearer value is your Hevy API key, not an OAuth token. The Worker validates
the key with Hevy on each request, does not store it, and forwards it upstream
only as Hevy's required `api-key` header.

### OAuth for Claude.ai and other remote MCP clients

The hosted production Worker is deployed with an `OAUTH_KV` namespace binding,
so it exposes a full OAuth 2.1 layer for clients that cannot send a fixed
header, such as Claude.ai custom connectors. Self-hosted Workers can opt in by
following the `OAUTH_KV` setup in [CONTRIBUTING.md](./CONTRIBUTING.md):

- RFC 8414 / RFC 9728 discovery metadata under `/.well-known/`
- Dynamic client registration (`/register`) and PKCE token exchange (`/token`)
- An `/authorize` page where you paste your Hevy API key once; the key is
  validated with Hevy and stored encrypted inside the OAuth grant

Add the Worker URL ending in `/mcp` as a Claude.ai custom connector and
complete the authorization flow in the browser. Direct
`Authorization: Bearer <hevy-api-key>` requests keep working unchanged — the
OAuth layer is purely additive — and rotating your Hevy API key invalidates
every OAuth grant created with it.

The endpoint does not expose legacy SSE or a `GET` event stream. Without the
opt-in OAuth layer, clients that require OAuth discovery, dynamic
registration, or token refresh are not compatible unless they can send the
fixed custom header above.

### Self-host the Worker

See [CONTRIBUTING.md](./CONTRIBUTING.md) to deploy the Cloudflare Worker for
self-hosted Streamable HTTP.

## Advanced configuration

| Setting                | Default                        | Scope                         | Notes                                                                                                               |
| ---------------------- | ------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `HEVY_API_KEY`         | None; required                 | Local stdio                   | Hevy API key from the Hevy app. Never pass it in a URL.                                                             |
| `HEVY_MCP_API_TIMEOUT` | `30000` ms                     | Local stdio                   | Positive Hevy API timeout in milliseconds. Invalid values fall back to 30 seconds.                                  |
| `HEVY_MCP_DEBUG`       | Disabled                       | Local stdio                   | Set to exactly `1` for privacy-bounded diagnostics on stderr. Stdout remains reserved for MCP JSON-RPC.             |
| `XDG_CACHE_HOME`       | `~/.cache`                     | Local stdio                   | Changes the root for the npm update-check cache at `hevy-mcp/update-check.json`.                                    |
| `SENTRY_DSN`           | Packaged project DSN           | Optional local Node telemetry | Overrides the Sentry destination. An empty value disables Sentry export. The Worker does not import Node telemetry. |
| `SENTRY_RELEASE`       | `hevy-mcp@<installed-version>` | Optional local Node telemetry | Overrides the release label attached to local Sentry events and traces.                                             |
| `-h`, `--help`         | N/A                            | Local stdio CLI               | Print supported options and exit.                                                                                   |
| `-v`, `--version`      | N/A                            | Local stdio CLI               | Print the installed version and exit.                                                                               |

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
- Hosted clients send the key only in the `Authorization: Bearer` header. The
  Worker validates each key with Hevy, does not store it, and sends it upstream
  only as Hevy's `api-key` header.
- Browser requests must come from an exact allowlisted origin. The default
  allowlist includes Claude.ai, ChatGPT, VS Code for the Web, and github.dev;
  self-hosted deployments can override it with `MCP_ALLOWED_ORIGINS`.
- Local development can copy `.dev.vars.example` to `.dev.vars` to disable
  Origin validation for MCP Inspector. PR preview Workers use the same
  development-only setting because their browser origins are dynamic. Never
  set `MCP_DISABLE_ORIGIN_CHECK=true` on a production Worker.
- Create operations can produce duplicates when retried. Update operations
  replace existing records. Review tool inputs and use client confirmations.

## Troubleshooting

- **The server does not appear:** restart or reconnect your MCP client after
  changing its configuration.
- **`npx` fails:** confirm that Node.js 20 or newer is installed, then run
  `npx -y hevy-mcp --version` in a terminal.
- **Codex cannot see the server:** run `codex mcp list`, then start a new Codex
  session after confirming the `hevy` entry exists.
- **Hosted authentication fails:** confirm the key is active, belongs to a Hevy
  PRO account, and is sent as `Authorization: Bearer <HEVY_API_KEY>`.
- **Local authentication fails:** confirm the key is active and available to the
  MCP child process as `HEVY_API_KEY`.
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
