---
"hevy-mcp": patch
---

Fix Streamable HTTP session lifecycle: interrupt idle-eviction fibers asynchronously instead of blocking synchronously, remove graceful-shutdown signal listeners after a close timeout, and record the "unknown" termination metric when session cleanup fails with no session established.
