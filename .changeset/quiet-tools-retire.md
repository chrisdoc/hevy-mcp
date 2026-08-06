---
"@hevy-mcp/core": patch
"hevy-mcp": major
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Remove MCP tools that duplicate the `hevy://user`, `hevy://workout-count`, `hevy://exercise-templates`, and `hevy://routine-folders` resources. Clients should use those resources for complete datasets and retain `search-exercise-templates` for filtered catalog searches.
