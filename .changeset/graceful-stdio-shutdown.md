---
"hevy-mcp": patch
---

Gracefully close and flush the stdio transport on SIGINT or SIGTERM, with a
bounded forced-exit fallback when shutdown stalls or other handles remain open.
