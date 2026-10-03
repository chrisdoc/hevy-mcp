---
"@hevy-mcp/hevy-client": patch
"@hevy-mcp/operations": patch
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Return the saved routine or folder from create-routine, update-routine, and create-routine-folder by unwrapping Hevy's `routine`/`routine_folder` response envelopes, and declare structured output schemas for update-routine and create-routine-folder.
