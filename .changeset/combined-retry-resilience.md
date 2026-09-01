---
"@hevy-mcp/hevy-client": patch
"@hevy-mcp/operations": patch
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Combine five retry-resilience and error-clarity fixes into one release:

- Retry read operations once with a fresh timeout budget after a deadline,
  bounded by an overall operation deadline. Per-operation timeoutMs overrides
  are now supported. An explicit caller deadline remains authoritative —
  no deadline retry extends beyond it.
- Give each retry attempt its own fresh per-attempt timeout window and add
  bounded crypto-random jitter to all retry backoff, reducing synchronized
  HTTP 429 retries.
- Report caller-initiated request cancellation as a client cancellation
  instead of an ambiguous Hevy API cancellation.
- Reject invalid empty routine exercise and set lists before API calls, and
  include sanitized Hevy validation details when routine mutations receive
  HTTP 400 responses.
- Provide actionable guidance when creating a body measurement conflicts with
  an existing date.
