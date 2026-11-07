---
"@hevy-mcp/hevy-client": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Reject "." and ".." path IDs before any request, honor the `sleep` client option for retry waits, keep API keys from leaking at the error-text boundary, accept HTTP-date `Retry-After` for rate-limit errors, ignore a NaN deadline, and stop `createRoutine` crashing on a non-object 201 body.
