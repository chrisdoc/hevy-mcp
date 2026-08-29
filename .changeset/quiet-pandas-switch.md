---
"@hevy-mcp/operations": patch
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

chore: switch the repository package manager from npm to pnpm 12. Internal workspace dependencies use the `workspace:*` protocol, scripts/workflows/docs were migrated, and the lockfile is now `pnpm-lock.yaml`. No runtime behavior change.
