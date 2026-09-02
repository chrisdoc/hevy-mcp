---
"@hevy-mcp/hevy-client": patch
"@hevy-mcp/operations": patch
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Add characterization tests for the Hevy client: retry scheduling, request-local
retry state, and fetch config merging (mergeConfig immutability, ambient
setConfig/getConfig, and the fetch entrypoint). Test-only coverage with no
runtime or API behavior changes.
