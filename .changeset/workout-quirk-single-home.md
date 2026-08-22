---
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Give the workout is_private quirk one home in hevy-quirks; the runtime rule, user-facing error, and tool-description clauses all derive from the same constants so they cannot drift.
