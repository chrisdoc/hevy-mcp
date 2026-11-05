---
"hevy-mcp": patch
---

Stop reporting request deadline expiry as Sentry errors; deadline failures remain in metrics and traces. Unversioned `hevy-mcp@dev` builds now always report to the `development` Sentry environment instead of `production`.
