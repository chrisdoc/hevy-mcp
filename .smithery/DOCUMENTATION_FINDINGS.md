docker build -t hevy-mcp .
docker run -p 8081:8081 \
# Smithery Documentation Summary - Key Findings

Smithery now supports TypeScript MCP servers directly, so we no longer need Docker or an HTTP bridge. The latest docs (https://smithery.ai/docs/build/deployments/typescript) boil down to the following actionable items for this repo.

## 1. Runtime & Project Layout

- Use `runtime: "typescript"` with an explicit `entry` that exports a default `createServer` (see `smithery.yaml`).
- The project structure that Smithery expects (package.json, tsconfig, src/index.ts) already matches `hevy-mcp`.

## 2. Config Schema

- Smithery consumes the exported `configSchema` from the entry module. This project now exports a Zod schema that only requires `apiKey` (mapped to `HEVY_API_KEY`).
- No extra wiring in `smithery.yaml` is necessary once the schema is exported—Smithery renders the prompt UI automatically.

## 3. CLI & Scripts

- Install `@smithery/cli` as a dev dependency.
- Add scripts for `smithery build` and `smithery dev` so contributors can preview/playground the server locally.

## 4. Deployment Flow

1. Run `pnpm run smithery:dev` to launch the Smithery playground (prompts for `HEVY_API_KEY`, invokes `createServer({ config })`).
2. Use `pnpm run smithery:build` to produce the bundle Smithery deploys remotely.
3. From the Smithery dashboard, trigger a deployment—no containers or extra env wiring required.

## 5. Documentation Touchpoints

- Update `README.md` and `.smithery/README.md` to describe the TypeScript runtime workflow and make it clear that Docker/HTTP transport remain deprecated.
- Ensure `smithery.yaml` links back to the repo and the TypeScript deployment guide for discoverability.

## References

- [TypeScript Deployment Guide](https://smithery.ai/docs/build/deployments/typescript)
- [Smithery Getting Started](https://smithery.ai/docs/getting_started)
