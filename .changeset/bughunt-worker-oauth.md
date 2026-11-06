---
"@hevy-mcp/worker": patch
---

With OAuth enabled, `/mcp` now rejects non-POST methods with 405 and serves only the exact `/mcp` path, and the consent page shows the redirect host and marks the client name as self-asserted.
