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
  - [Claude Desktop Configuration](#claude-desktop-configuration)
  - [Cursor Configuration](#cursor-configuration)
  - [Other MCP Clients (via add-mcp)](#other-mcp-clients-via-add-mcp)
- [Why hevy-mcp?](#why-hevy-mcp)
- [Configuration](#configuration)
- [Available MCP Tools](#available-mcp-tools)
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

| Scenario              | Command                                     | Requirements               |
| :-------------------- | :------------------------------------------ | :------------------------- |
| **One-off stdio run** | `HEVY_API_KEY=sk_live... npx -y hevy-mcp`   | Node.js ≥ 26, Hevy API key |
| **Local development** | `npm install && npm run build && npm start` | `.env` with `HEVY_API_KEY` |

---

## 🛠️ Prerequisites

- **Node.js**: v26 or higher (strongly recommended to use the exact version pinned in `.nvmrc`).
- **npm**: v10 or higher.
- **Hevy API key**: Required for all operations (available with Hevy PRO).

---

## 📦 Installation

### Run via npx (Recommended)

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
npm install

# Create .env and add your keys
cp .env.sample .env
# Edit .env and add your HEVY_API_KEY
```

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

```env
# Example .env
HEVY_API_KEY=your_hevy_api_key_here
```

### 📡 Sentry Monitoring

`hevy-mcp` includes Sentry monitoring to observe errors and usage in production. It initializes `@sentry/node` with tracing enabled and PII collection disabled by default. Recent observability changes also add:

- lifecycle spans around server build, run, and stdio connect
- per-tool execution spans plus captured handler exceptions
- stdio parse diagnostics, including leading UTF-8 BOM stripping and invalid JSON context
- a deterministic pseudonymous Sentry user ID derived from `HEVY_API_KEY`, so the raw key is never sent to Sentry

---

<details>
<summary><strong>⚠️ Deprecation Notices (HTTP/SSE & Docker)</strong></summary>

### Stdio Only

As of version **1.18.0**, `hevy-mcp` only supports **stdio** transport. HTTP/SSE transport has been completely removed to simplify the codebase and focus on the native MCP experience.

### Docker

Docker-based workflows are retired. The provided `Dockerfile` now exits with a message pointing to the stdio-native experience. Legacy GHCR images are no longer updated.

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

---

## 👨‍💻 Development & Contributing

### Quick Commands

- **Build**: `npm run build`
- **Lint/Format**: `npm run check` (uses oxlint/oxfmt)
- **Unit Tests**: `npx vitest run --exclude tests/integration/**`
- **Full Test Suite**: `npm test` (requires `HEVY_API_KEY`)
- **Changeset Check**: `npm run check:changeset`

For a detailed senior engineer guide, please refer to [AGENTS.md](./AGENTS.md).

### Pull Request Checks

- **Conventional Commits**: CI lints commit messages on pull requests, so use
  prefixes such as `feat:`, `fix:`, `docs:`, `ci:`, `chore:`, `refactor:`,
  `test:`, or `style:`.
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
