---
"@hevy-mcp/worker": patch
---

Retry transient Hevy API key validation failures (e.g. HTTP 503 or 408; HTTP 429 is intentionally not retried, to avoid spending calls against the rate limit that caused the outage), log the upstream status/code when validation still fails, and cache successful validations for 15 minutes so a brief Hevy outage no longer turns into a 502 for a key that was just confirmed valid.
