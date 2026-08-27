---
"@hevy-mcp/worker": patch
---

Retry transient Hevy API key validation failures (e.g. HTTP 429), log the upstream status/code when validation still fails, and cache successful validations for 15 minutes so a brief Hevy outage no longer turns into a 502 for a key that was just confirmed valid.
