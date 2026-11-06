---
"@hevy-mcp/hevy-client": patch
"@hevy-mcp/operations": patch
"@hevy-mcp/core": patch
"@hevy-mcp/worker": patch
"hevy-mcp": patch
"@chrisdoc/hevy-cli": patch
---

Update development dependencies and regenerate the API client with Kubb 5.15. The generated write operations now declare an `application/json` request content type, and the generated body serializer matches content types case-insensitively.
