---
"hevy-mcp": patch
---

Validate the configured Hevy API key before accepting MCP tool calls. Reject
confirmed authentication failures with a sanitized error, while warning and
continuing startup when validation is unavailable for other reasons.
