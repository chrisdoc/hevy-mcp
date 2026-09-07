---
"@hevy-mcp/hevy-client": patch
"@hevy-mcp/operations": patch
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Restore the fresh-budget deadline retry for timed-out reads. The Effect runtime
migration dropped the extended operation deadline, so a read whose first attempt
overshot its timeout could starve the retry before dispatch and skip the second
fetch.
