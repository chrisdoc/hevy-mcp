---
"hevy-mcp": patch
---

Expose the client's maxGetRetries option through createNodeMcpServer. Embedders can set it to zero to disable automatic request retries, including PUT retries, and reconcile uncertain writes explicitly. Omitting the option preserves the existing client policy.
