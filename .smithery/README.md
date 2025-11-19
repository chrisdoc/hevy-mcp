# Smithery Deployment Guide

Smithery support is back, now targeting the TypeScript runtime path described in the [official documentation](https://smithery.ai/docs/build/deployments/typescript). This server remains stdio-first for local usage, but you can also deploy it remotely through Smithery without Docker.

## Overview

- **Runtime**: `runtime: "typescript"` with `entry: "src/index.ts"` (see `smithery.yaml`).
- **Configuration**: The server exports `configSchema` from `src/index.ts`. Smithery reads that schema and prompts the user for `HEVY_API_KEY`.
- **Transport**: Smithery invokes the exported `createServer` function, so no HTTP bridge or container build is required.

## Prerequisites

1. Node.js ≥ 20 (matches project requirement).
2. Install dependencies: `pnpm install`.
3. Smithery CLI available via `@smithery/cli` (already listed in `devDependencies`).

## Key Files

- `smithery.yaml` – declares the TypeScript runtime entry, metadata, and helpful links.
- `src/index.ts` – exports `configSchema` (requires `HEVY_API_KEY`) and a default `createServer` compatible with Smithery.
- `package.json` – provides `smithery:build` / `smithery:dev` scripts that wrap the Smithery CLI.

## Local Workflow

```bash
# Build the project once (tsup bundles the stdio entry as usual)


# Launch the Smithery playground against the TypeScript runtime
pnpm run smithery:dev

# When ready, produce the Smithery bundle
pnpm run smithery:build
```

During `smithery dev`/`smithery build`, the CLI consumes `smithery.yaml`, imports `src/index.ts`, reads the exported `configSchema`, and asks for your `HEVY_API_KEY`. That key is then supplied via `createServer({ config })`, matching the stdio CLI behavior.

## Deploying Remotely

1. Commit the updated `smithery.yaml`, `package.json`, and `src/index.ts`.
2. Push to GitHub and connect the repo to Smithery.
3. From the Smithery UI, trigger a deployment. No Dockerfile or HTTP server configuration is involved—the CLI bundles the TypeScript output directly.

## Notes

- Docker- and HTTP-based transports remain deprecated; the TypeScript runtime path keeps everything MCP-native.
- If additional configuration fields are needed later, extend the exported `configSchema` and Smithery will pick them up automatically.
  type: "http"
