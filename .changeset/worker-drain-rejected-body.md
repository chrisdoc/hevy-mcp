---
"@hevy-mcp/worker": patch
---

The Worker now reads the full body of requests it rejects early (such as 401, 406 and 415), so `workerd` can reuse the connection and the next request on it no longer fails with a 500.
