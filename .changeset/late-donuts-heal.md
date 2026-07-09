---
"hevy-mcp": patch
---

Deprecate CLI API key arguments by warning on stderr whenever
`--hevy-api-key=...`, `--hevyApiKey=...`, or `hevy-api-key=...` is used.
Keep backward compatibility for those flags while documenting `HEVY_API_KEY`
as the recommended and secure configuration path.
