---
"hevy-mcp": patch
---

Fix stdio dropping a request that follows many malformed lines, leaked servers after rejected HTTP initialize requests, and client transport errors being reported as unexpected failures.
