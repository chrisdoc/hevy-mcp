---
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@chrisdoc/hevy-cli": patch
---

Apply oxfmt 0.63.0 formatting to core mapped-type declarations in `execution.ts`, `tools/input-schemas.ts`, and `tools/tool-runtime.ts`. Formatting only — no functional change. `hevy-mcp` and `@chrisdoc/hevy-cli` get a patch bump solely because the release cascade re-releases core's consumers.
