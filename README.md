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
[![MCP Toplist](https://mcptoplist.com/badge/io.github.chrisdoc%2Fhevy-mcp.svg)](https://mcptoplist.com/server/io.github.chrisdoc%2Fhevy-mcp)

[Connect to the hosted MCP](#connect-to-the-hosted-endpoint) · [Use the Hevy CLI](#hevy-cli) · [Watch the 18-second demo](https://raw.githubusercontent.com/chrisdoc/hevy-mcp/main/docs/assets/hevy-mcp-demo.mp4) · [Explore all 26 tools](#tools)

</div>

## Hevy CLI

Prefer the terminal? The separate
[`@chrisdoc/hevy-cli`](https://www.npmjs.com/package/@chrisdoc/hevy-cli)
package reads workouts, routines, exercises, and body measurements directly
from the Hevy API, and can create or update those resources with explicit
confirmation. Deletion is not supported.

```sh
npm install -g @chrisdoc/hevy-cli
export HEVY_API_KEY=your-hevy-api-key

hevy workouts list --page-size 10
hevy summary --weeks 4
```

Add `--json` to any command for scripts and pipelines. The CLI is a standalone
Hevy API client, not an MCP wrapper. See
[`packages/cli/README.md`](packages/cli/README.md) for the full command
reference, pagination behavior, and exit codes.

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
https://mcp.hevy-mcp.dev/mcp
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
  --url https://mcp.hevy-mcp.dev/mcp \
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
			"url": "https://mcp.hevy-mcp.dev/mcp",
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

##### Google Antigravity

There are two ways to configure the Hevy MCP server for Google Antigravity (`agy`):

###### Option A: Automatic Plugin Installation (Recommended)

This utilizes the built-in plugin system:

1. Install the plugin:

   ```bash
   agy plugin install https://github.com/chrisdoc/hevy-mcp
   ```

2. Provide the `HEVY_API_KEY` in your host shell environment so the CLI child process can inherit it:
   - **Persistent:** Save the environment variable `HEVY_API_KEY` in your system/shell configurations:
     - **macOS / Linux:** Add it to your shell profile configurations (e.g., `~/.zshrc` or `~/.bashrc`):
       ```bash
       export HEVY_API_KEY="your-actual-api-key"
       ```
     - **Windows:** Add it to your User or System Environment Variables. In PowerShell, you can run:
       ```powershell
       [Environment]::SetEnvironmentVariable("HEVY_API_KEY", "your-actual-api-key", "User")
       ```
   - **Temporary (Session-only):** If you do not want to persist the key, export it in your active terminal session before running `agy`:
     ```bash
     export HEVY_API_KEY="your-actual-api-key"
     ```

###### Option B: Manual Configuration (No Plugin)

If you prefer configuring it statically via the global configuration file:

1. Open your global MCP configuration file:
   - **Location:** `~/.gemini/config/mcp_config.json`

2. Add the `hevy` configuration block under the `mcpServers` key. Make sure to merge this entry with any existing servers you have configured rather than replacing the entire file contents:
   ```json
   {
   	"mcpServers": {
   		"hevy": {
   			"command": "npx",
   			"args": ["-y", "hevy-mcp"],
   			"env": {
   				"HEVY_API_KEY": "your-actual-api-key"
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

| Prompt                        | Arguments                                  | Workflow                                                                                                               |
| ----------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `analyze-workout-progress`    | Optional `weeks` from 1-12; default `4`    | Calls `get-training-summary`, then analyzes workout activity and body-measurement trends from the returned evidence.   |
| `create-workout-from-routine` | Required `routine_id` and UTC `start_time` | Loads a routine, collects actual completed-set data and an end time, then creates a workout without inventing results. |

> [!NOTE]
> With MCP SDK v1.29.0, clients invoking `analyze-workout-progress` with its
> default value must send `arguments: {}`. Omitting the entire `arguments`
> object is rejected by that SDK version before the default is applied.

## Tools

`hevy-mcp` registers 26 tools. Read-only tools are safe for exploration; create
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
| Workouts           | `update-workout`            | Patch workout metadata by ID; omitted fields and all exercises remain unchanged.  |
| Workouts           | `replace-workout-exercises` | Replace all exercises and sets while preserving workout metadata.                 |
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
https://mcp.hevy-mcp.dev/mcp
```

It is the quickest way to use `hevy-mcp`: there is nothing to install or keep
running locally, and it exposes the same 26 tools as the npm package and Docker
image.

The Cloudflare Worker uses stateless **Streamable HTTP** at `POST /mcp`.
Clients must send their Hevy API key as a fixed authorization header:

```json
{
	"mcpServers": {
		"hevy": {
			"url": "https://mcp.hevy-mcp.dev/mcp",
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

OAuth access tokens last seven days and refresh tokens last 30 days. This
reduces KV writes from frequent hourly refreshes while preserving automatic
refresh for supported clients.

The endpoint does not expose legacy SSE or a `GET` event stream. Without the
opt-in OAuth layer, clients that require OAuth discovery, dynamic
registration, or token refresh are not compatible unless they can send the
fixed custom header above.

### Self-host the Worker

A clean clone can deploy the portable TypeScript Wrangler configuration with
`npx wrangler deploy --x-new-config` and receive a `workers.dev` URL. OAuth
requires your own `OAUTH_KV` namespace; custom domains, routes, and
observability destinations are optional account-owned settings. See
[CONTRIBUTING.md](./CONTRIBUTING.md#cloudflare-worker-development) for setup and
for the distinction between self-hosting and the maintainer-only named
environments.

See [CONTRIBUTING.md](./CONTRIBUTING.md) to deploy the Cloudflare Worker for
self-hosted Streamable HTTP.

## Advanced configuration

| Setting                      | Default                        | Scope                         | Notes                                                                                                                                                                                                                                                          |
| ---------------------------- | ------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HEVY_API_KEY`               | None; required                 | Local stdio or HTTP           | Hevy API key from the Hevy app. Never pass it in a URL.                                                                                                                                                                                                        |
| `HEVY_MCP_API_TIMEOUT`       | `30000` ms                     | Local stdio                   | Positive Hevy API timeout in milliseconds. Invalid values fall back to 30 seconds.                                                                                                                                                                             |
| `HEVY_MCP_DEBUG`             | Disabled                       | Local Node                    | Set to exactly `1` for privacy-bounded diagnostics on stderr. Stdout remains reserved for MCP JSON-RPC.                                                                                                                                                        |
| `HEVY_MCP_HTTP_BEARER_TOKEN` | None                           | Non-loopback HTTP             | Required when `--host` is not loopback; use a separate token, never the Hevy API key.                                                                                                                                                                          |
| `HEVY_MCP_TELEMETRY`         | Enabled                        | Local Node                    | Set to exactly `0` before startup/import to disable Sentry and OTLP traces/metrics. When enabled and `SENTRY_DSN` is non-empty, Sentry remains enabled for error monitoring; OTLP traces include privacy-safe tool failure and process-level exception events. |
| `XDG_CACHE_HOME`             | `~/.cache`                     | Local stdio                   | Changes the root for the npm update-check cache at `hevy-mcp/update-check.json`.                                                                                                                                                                               |
| `SENTRY_DSN`                 | Packaged project DSN           | Optional local Node telemetry | Sentry-only override for the destination. An empty value disables Sentry export. The Worker does not import Node telemetry.                                                                                                                                    |
| `SENTRY_RELEASE`             | `hevy-mcp@<installed-version>` | Optional local Node telemetry | Overrides the release label attached to local Sentry events and traces.                                                                                                                                                                                        |
| `-h`, `--help`               | N/A                            | Local stdio CLI               | Print supported options and exit.                                                                                                                                                                                                                              |
| `-v`, `--version`            | N/A                            | Local stdio CLI               | Print the installed version and exit.                                                                                                                                                                                                                          |

The local Node executable uses stdio by default. Opt into local Streamable
HTTP with:

```bash
HEVY_API_KEY=your-hevy-api-key npx hevy-mcp --transport http --host 127.0.0.1 --port 3000
```

The local MCP endpoint is `http://127.0.0.1:3000/mcp`; non-loopback binds
require the separate `HEVY_MCP_HTTP_BEARER_TOKEN` environment variable. A
Docker deployment must publish the port explicitly:

```bash
docker run --rm -p 3000:3000 -e HEVY_API_KEY -e HEVY_MCP_HTTP_BEARER_TOKEN \\
  ghcr.io/chrisdoc/hevy-mcp:latest --transport http --host 0.0.0.0 --port 3000
```

This Node HTTP mode is distinct from the stateless Cloudflare Worker HTTP
endpoint described above: the Node server owns stateful client sessions, while
the Worker is designed for hosted deployment and does not import Node code.

### Cache behavior

`search-exercise-templates` and `hevy://exercise-templates` share a
server-scoped in-memory catalog cache:

- Entries live for five minutes, and the cache holds at most one catalog.
- Concurrent catalog requests share an in-flight fetch when possible.
- `search-exercise-templates` accepts `refresh: true` to invalidate the cache.
- Paginated `get-exercise-templates` calls always fetch their requested page.
- Each hosted Worker request gets a fresh cache, preventing cross-key sharing.

### Local Node telemetry and privacy

The local Node package enables project telemetry by default. It is local Node
behavior only; the Cloudflare Worker does not import Node telemetry. Set
`HEVY_MCP_TELEMETRY=0` before startup or import to disable all project
telemetry. Only the literal value `0` opts out: an unset value, an empty value,
`1`, `false`, and every other value remain enabled. The master setting takes
precedence over `SENTRY_DSN` and packaged or runtime `OTEL_COLLECTOR_TOKEN`
credentials, so the disabled path creates no telemetry exporters or periodic
metric readers and makes no telemetry network requests. `SENTRY_DSN` remains a
Sentry-only setting; when telemetry is enabled, an empty value disables only
Sentry export.

When enabled, errors and traces are sent to the packaged Sentry project at
<https://o4508975499575296.ingest.de.sentry.io/4509049671647312>. Traces and
metrics are sent to the collector at
<https://otel.chrisdoc.dev/v1/traces> and
<https://otel.chrisdoc.dev/v1/metrics>, which forward to Honeycomb. Metrics
export every 10 seconds.

The API key is never exported. Enabled telemetry derives a deterministic
ten-character HMAC-SHA-256 pseudonym from it solely for cross-span
correlation. The pseudonym is attached to spans only, never used as a metric
dimension, and is not intended for per-user behavior histories.

The privacy allowlist contains service/version/transport; fixed tool feature,
read/write kind, operation, and short-lived tool name; bounded
outcome/error/count/retry/duration/session/cache/workflow values; normalized API
method/endpoint/status; shape-only key names, presence, count, and boolean
fields; sanitized client/protocol tokens; and the span-only pseudonym. It
explicitly prohibits raw prompts, tool argument values, tool result content,
request bodies, API keys, raw identifiers/queries/exact dates,
workout/routine/folder/template/body-measurement content, names/titles/
descriptions/notes, measurement values, arbitrary client metadata, and
unnormalized endpoint paths.

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
