---
"@hevy-mcp/operations": patch
"@hevy-mcp/core": patch
"@chrisdoc/hevy-cli": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
---

Body measurement updates now keep omitted fields instead of clearing them, and fail with not-found rather than creating a missing entry. Routine sets accept null weight, distance, duration and custom metric, and routine exercises accept null rest time, instead of coercing them to 0. The CLI `workouts update` now requires `is_private` instead of silently making private workouts public. Training summaries cover exactly 7 days per week.
