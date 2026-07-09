---
"hevy-mcp": patch
---

Add `ignoreErrors: ["EPIPE", "broken pipe"]` to the Sentry config so
abrupt stdio client disconnects do not generate noisy Sentry events.
