---
---

Add a manual CLI safe-validation helper (`pnpm run test:cli:safe`).
Deterministic with a fake key by default; bounded read-only live checks
behind `HEVY_RUN_CLI_SAFE_LIVE=1`. Never runs a valid mutation with `--yes`.
