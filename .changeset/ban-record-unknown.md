---
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Ban `Record<string, unknown>` in Oxlint and replace existing uses with named object types or narrower `object` types.
