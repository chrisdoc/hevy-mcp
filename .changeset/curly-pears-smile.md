---
"hevy-mcp": patch
---

Add resilient Hevy API request handling with configurable timeout,
bounded retries for transient GET failures, Retry-After support for
429 responses, and clearer user-facing rate-limit/transient error
messages.
