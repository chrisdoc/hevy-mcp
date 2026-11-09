---
"@hevy-mcp/hevy-client": patch
"@hevy-mcp/operations": patch
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Refresh the checked-in Hevy OpenAPI specification and regenerated client. create-workout now unwraps Hevy's documented `workout` response envelope (still accepting an unwrapped workout), workout updates read the documented `superset_id` field while still accepting `supersets_id`, and routine set projections no longer read the `rpe` field that Hevy removed from routine responses.
