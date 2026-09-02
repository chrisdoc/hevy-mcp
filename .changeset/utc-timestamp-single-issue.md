---
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Fix `utcSecondTimestamp` reporting the same "Must use the UTC format YYYY-MM-DDTHH:mm:ssZ" validation error twice for a single invalid `start_time`/`end_time` value. The format and calendar-validity checks are now chained with `.pipe()` so the round-trip check only runs after the regex check succeeds, producing exactly one issue per invalid field while preserving the original `invalid_format` issue code and JSON Schema `pattern`.
