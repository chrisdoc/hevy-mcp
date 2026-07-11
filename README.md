# hevy-mcp: Model Context Protocol Server for Hevy Fitness API

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Build and Test](https://github.com/chrisdoc/hevy-mcp/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/chrisdoc/hevy-mcp/actions/workflows/build-and-test.yml)
[![Codecov](https://codecov.io/gh/chrisdoc/hevy-mcp/branch/main/graph/badge.svg)](https://codecov.io/gh/chrisdoc/hevy-mcp)
[![npm version](https://img.shields.io/npm/v/hevy-mcp.svg)](https://www.npmjs.com/package/hevy-mcp)

A Model Context Protocol (MCP) server implementation that interfaces with the [Hevy fitness tracking app](https://www.hevyapp.com/) and its [API](https://api.hevyapp.com/docs/). This server enables AI assistants like **Claude Desktop** and **Cursor** to access and manage workout data, routines, and exercise templates through the Hevy API (requires PRO subscription).

---

## 📋 Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [Run with Docker](#run-with-docker)
  - [Claude Desktop Configuration](#claude-desktop-configuration)
  - [Cursor Configuration](#cursor-configuration)
  - [Other MCP Clients (via add-mcp)](#other-mcp-clients-via-add-mcp)
- [Why hevy-mcp?](#why-hevy-mcp)
- [Configuration](#configuration)
- [Available MCP Tools](#available-mcp-tools)
- [Available MCP Resources](#available-mcp-resources)
- [Development & Contributing](#development--contributing)

---

## 🚀 Features

- **Workout Management**: Fetch, create, and update workouts.
- **Routine Management**: Access and manage workout routines.
- **Exercise Templates**: Browse available exercise templates with in-memory caching.
- **Folder Organization**: Manage routine folders.

---

## 🏁 Quick Start

Pick the workflow that fits your setup:

| Scenario              | Command                                                                                 | Requirements                           |
| :-------------------- | :-------------------------------------------------------------------------------------- | :------------------------------------- |
| **One-off stdio run** | `HEVY_API_KEY=your_key npx -y hevy-mcp` or `HEVY_API_KEY=your_key bunx hevy-mcp@latest` | Node.js 24 or 26, Hevy API key         |
| **Docker stdio run**  | `docker run -i --rm -e HEVY_API_KEY ghcr.io/chrisdoc/hevy-mcp:latest`                   | Docker, Hevy API key                   |
| **Local development** | `npm install && npm run build && npm start`                                             | Node.js 24, `.env` with `HEVY_API_KEY` |

---

## 🛠️ Prerequisites

- **Node.js**: v24 for development and the primary runtime, or v26 for npm
  package compatibility.
- **npm**: v10 or higher.
- **Bun** (optional): `bunx hevy-mcp@latest` receives a nightly launcher smoke;
  this is not a versioned Bun server-runtime support promise.
- **Docker** (optional): If you want an isolated container-based stdio setup.
- **Hevy API key**: Required for all operations (available with Hevy PRO).

---

## 📦 Installation

### Run via npx or bunx

You can launch the server directly without cloning. Both launchers are covered
by nightly smoke tests. The npm package supports Node.js 24.x and 26.x; the
`bunx` check validates only that the latest published package can be launched:

```bash
# npm launcher
HEVY_API_KEY=your_hevy_api_key_here npx -y hevy-mcp

# bun launcher
HEVY_API_KEY=your_hevy_api_key_here bunx hevy-mcp@latest
```

### Runtime support policy

| Runtime or distribution                                      | Validation level                                                                                               |
| :----------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| Node.js 24.x                                                 | Primary: local development, release validation, the official Docker image, and the full deterministic CI lane. |
| Node.js 26.x                                                 | npm-package compatibility: install, type, manifest, style, build, mocked integration, and unit checks in CI.   |
| Node.js 20–23 and odd or otherwise unvalidated future majors | Unsupported; the package does not claim compatibility.                                                         |
| Bun via `bunx`                                               | Nightly launcher smoke for `hevy-mcp@latest`; not a versioned Bun runtime guarantee.                           |

The canonical npm engine range is `^24.0.0 || ^26.0.0`. Contributors should
use the Node 24 version selected by `.nvmrc` unless they are explicitly checking
the Node 26 compatibility lane.

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/chrisdoc/hevy-mcp.git
cd hevy-mcp

# Install dependencies
npm install

# Create .env and add your keys
cp .env.sample .env
# Edit .env and add your HEVY_API_KEY
```

### Run with Docker

Official multi-platform images are published to GitHub Container Registry for
`linux/amd64` and `linux/arm64`:

```bash
export HEVY_API_KEY=your_hevy_api_key_here
docker run -i --rm -e HEVY_API_KEY ghcr.io/chrisdoc/hevy-mcp:latest
```

The server uses stdio, so `-i` keeps standard input open for the MCP client.
`--rm` removes the stopped container automatically. The `-e HEVY_API_KEY`
form forwards the variable from the host environment without putting the key
in the command arguments.

Use `latest` to follow the newest stable release. For reproducible deployments,
pin the exact version shown on the release, using a tag such as
`ghcr.io/chrisdoc/hevy-mcp:X.Y.Z`. Major (`:X`) and major.minor (`:X.Y`) tags
are also published for controlled automatic updates.

---

## 🔗 Integration

### Claude Desktop Configuration

To use this server with Claude Desktop, add the following to your `claude_desktop_config.json`:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
	"mcpServers": {
		"hevy-mcp": {
			"command": "npx",
			"args": ["-y", "hevy-mcp"],
			"env": {
				"HEVY_API_KEY": "sk_live_your_key_here"
			}
		}
	}
}
```

If you prefer Bun, swap the launcher fields:

```json
{
	"command": "bunx",
	"args": ["hevy-mcp@latest"]
}
```

To run Claude Desktop through Docker instead, first create an environment file
outside the repository containing your real key:

```dotenv
HEVY_API_KEY=replace_with_your_real_key
```

Restrict access to that file where supported (for example,
`chmod 600 /absolute/path/to/hevy-mcp.env`), then use its absolute path in the
Claude Desktop configuration:

```json
{
	"mcpServers": {
		"hevy-mcp": {
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

This configuration runs the same stdio server inside the container; it does
not expose an HTTP port or start a detached service. Docker reads the key from
the environment file, so the Claude configuration does not replace an
inherited key with a placeholder. Replace `latest` with an exact version tag if
you want Claude Desktop to stay on a pinned release.

### Cursor Configuration

Add this server under `"mcpServers"` in `~/.cursor/mcp.json`:

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

If you prefer Bun, swap the launcher fields:

```json
{
	"command": "bunx",
	"args": ["hevy-mcp@latest"]
}
```

### Other MCP Clients (via add-mcp)

For a generic setup flow across MCP clients, use [`add-mcp`](https://github.com/neon-solutions/add-mcp):

```bash
npx add-mcp hevy-mcp --env "HEVY_API_KEY=secret"
```

This bootstraps the `hevy-mcp` entry in your client config without manual JSON edits.

---

## ✨ Why hevy-mcp?

- 🚀 **High Performance**: Built with the **Oxc** toolchain (`oxlint`/`oxfmt`) for near-instant linting and formatting.
- 🛡️ **Type Safety**: Fully type-safe implementation using **Zod** and **Kubb**-generated API clients.
- 📉 **Observability**: Built-in **Sentry** monitoring for error tracking, lifecycle and tool tracing, and stdio parse diagnostics.
- ⚡ **Optimized**: Includes in-memory caching for exercise templates to reduce API latency.

---

## ⚙️ Configuration

Supply your Hevy API key via the `HEVY_API_KEY` environment variable (in
`.env` or system environment).

> ⚠️ CLI API key arguments (`--hevy-api-key=...`, `--hevyApiKey=...`,
> `hevy-api-key=...`) are still accepted for backward compatibility, but are
> deprecated and insecure. Use `HEVY_API_KEY` instead.

Set `HEVY_MCP_API_TIMEOUT` to override the default 30-second Hevy API request
timeout. Its value is in milliseconds.

Set `HEVY_MCP_DEBUG=1` to emit verbose, privacy-bounded diagnostics to stderr.
Debug records include tool invocations and sanitized Hevy API response timing
and status details. Other values leave diagnostics disabled, and stdout remains
reserved for the MCP JSON-RPC stream.

```env
# Example .env
HEVY_API_KEY=your_hevy_api_key_here
# Optional: customize Hevy API request timeout (milliseconds)
HEVY_MCP_API_TIMEOUT=30000
# Optional: enable verbose stderr diagnostics (only the value 1 enables it)
HEVY_MCP_DEBUG=1
```

### 🧠 Exercise Template Cache Behavior

`search-exercise-templates` and the `hevy://exercise-templates` resource use a
shared in-memory async cache for the full exercise template catalog:

- **TTL**: 5 minutes per cached catalog entry.
- **Memory bound**: max 1 catalog entry (LRU bounded cache).
- **In-flight de-duplication**: concurrent requests share the same active
  fetch when possible.
- **Manual refresh**: set `refresh: true` in the tool input to invalidate the
  cached catalog and force a re-fetch from the Hevy API.

Paginated `get-exercise-templates` requests still call the API directly to keep
paging behavior explicit and avoid cross-page invalidation complexity.

### 📡 Sentry Monitoring

`hevy-mcp` includes Sentry monitoring to observe errors and usage in production. It initializes `@sentry/node` with tracing enabled and PII collection disabled by default. Recent observability changes also add:

- lifecycle spans around server build, run, and stdio connect
- per-tool execution spans plus captured handler exceptions
- stdio parse diagnostics, including leading UTF-8 BOM stripping and invalid JSON context
- a deterministic pseudonymous Sentry user ID derived from `HEVY_API_KEY`, so the raw key is never sent to Sentry

---

<details>
<summary><strong>⚠️ Migration Note (v1.18.0)</strong></summary>

As of **v1.18.0**, `hevy-mcp` removed HTTP/SSE transport and its previous
Docker packaging. Docker support is now available again for the stdio server.

Both `npx hevy-mcp` and the official container image use stdio; HTTP ports and
detached-container deployment are not supported.

</details>

---

## 🛠️ Available MCP Tools

| Category              | Tools                                                                                                                              |
| :-------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| **Workouts**          | `get-workouts`, `get-workout`, `create-workout`, `update-workout`, `get-workout-count`, `get-workout-events`                       |
| **Routines**          | `get-routines`, `get-routine`, `create-routine`, `update-routine`                                                                  |
| **Templates**         | `get-exercise-templates`, `get-exercise-template`, `search-exercise-templates`, `create-exercise-template`, `get-exercise-history` |
| **Folders**           | `get-routine-folders`, `get-routine-folder`, `create-routine-folder`                                                               |
| **Body Measurements** | `get-body-measurements`, `get-body-measurement`, `create-body-measurement`, `update-body-measurement`                              |
| **User**              | `get-user-info`                                                                                                                    |

> **Delete operations are currently unsupported:** The upstream Hevy OpenAPI
> spec does not expose `DELETE` endpoints for workouts, routines, routine
> folders, exercise templates, or body measurements, so `hevy-mcp` does not
> provide delete tools for these resources.

## 💬 Available MCP Prompts

| Prompt                        | Arguments                                                                              | Guided workflow                                       |
| :---------------------------- | :------------------------------------------------------------------------------------- | :---------------------------------------------------- |
| `analyze-workout-progress`    | Optional `weeks` (1-12; defaults to `4` when omitted from a supplied arguments object) | Analyze recent workout and body-measurement trends.   |
| `create-workout-from-routine` | `routineId`, `startTime` (UTC ISO seconds)                                             | Record a completed workout using a routine as a plan. |

Compatibility note: with MCP SDK v1.29.0, clients using the default must send
`arguments: {}` because the SDK rejects requests that omit the entire
`arguments` object before prompt field defaults are evaluated.

---

## 📚 Available MCP Resources

| Name                 | URI                         |
| :------------------- | :-------------------------- |
| `user-profile`       | `hevy://user`               |
| `workout-count`      | `hevy://workout-count`      |
| `exercise-templates` | `hevy://exercise-templates` |
| `routine-folders`    | `hevy://routine-folders`    |

---

## 👨‍💻 Development & Contributing

### Quick Commands

- **Build**: `npm run build`
- **Lint/Format**: `npm run check` (uses oxlint/oxfmt)
- **Type Check**: `npm run check:types`
- **Runtime Policy Check**: `npm run check:runtime-support`
- **Unit Tests**: `npx vitest run --exclude 'tests/integration/**'`
- **Full Test Suite**: `npm test` (requires `HEVY_API_KEY`)
- **Changeset Check**: `npm run check:changeset`

For a detailed senior engineer guide, please refer to [AGENTS.md](./AGENTS.md).

### Pull Request Checks

- **Conventional Commits**: CI lints commit messages on pull requests, so use
  prefixes such as `feat:`, `fix:`, `docs:`, `ci:`, `chore:`, `refactor:`,
  `test:`, or `style:`.
- **Type Checking**: CI runs `npm run check:types` on pull requests and pushes
  to `main`; run this locally before opening a PR.
- **Changesets**: Contributor pull requests targeting `main` must include a
  changeset. Dependabot PRs and automated `changeset-release/main` release PRs
  are handled by automation and skip this check.

### API Client Generation

The API client is automatically generated from the OpenAPI spec using [Kubb](https://kubb.dev/):

```bash
npm run build:client
```

### Versioning & Releases

This project uses [Changesets](https://github.com/changesets/changesets) to
manage versioning, changelogs, releases, and pull request validation.

1. **Routine Release Cadence**: Merge the automated
   `changeset-release/main` (**"Version Packages"**) Pull Request on a regular
   cadence (weekly is a good default) instead of ad-hoc frequent merges.
2. **Urgent Release Exception**: Security fixes and high-impact,
   user-facing bug fixes can be released immediately outside the routine
   cadence.
3. **Use Bump Changesets Only for User-Facing Runtime Changes**: If your
   change is user-facing/runtime-visible, run:
   ```bash
   npx changeset
   ```
   Follow the prompts to choose `patch`, `minor`, or `major`, then write a
   short summary. This creates a markdown file under `.changeset/`.
4. **Use Empty Changesets for Internal-Only Work**: Docs, CI, test-only,
   refactor, and chore changes should use an empty changeset:
   ```bash
   npx changeset --empty
   ```
5. **Validate Before Opening a PR**: Contributor pull requests targeting
   `main` are checked for a changeset in CI. Dependabot PRs and automated
   `changeset-release/main` release PRs are handled separately. You can run the
   same validation locally with:
   ```bash
   npm run check:changeset
   ```
6. **Automated Releases**:
   - Pushing changesets to `main` triggers a GitHub Action that automatically
     creates or updates a **"Version Packages"** Pull Request.
   - When this Pull Request is merged, the package is automatically built,
     published to npm (via OIDC Trusted Publishing), and a GitHub Release is
     created.

---

## 📄 License & Acknowledgements

- **License**: [MIT](./LICENSE)
- **Credits**: [Model Context Protocol](https://github.com/modelcontextprotocol), [Hevy Fitness](https://www.hevyapp.com/).

---

**Contributions are welcome!** Please open an issue or PR for any major changes.
