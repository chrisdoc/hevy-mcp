---
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Fix update-workout failing with Hevy API HTTP 500 when is_private is omitted.

The upstream Hevy API requires `is_private` in PUT requests, but the GET endpoint does not return it. The tool description stated that omitted fields remain unchanged, but this was not true for `is_private` due to API contract mismatch.

Changes:

- Add validation in `update-workout` to require explicit `is_private` value, preventing the opaque transient-error from the API
- Add `is_private` requirement to `replace-workout-exercises` schema and tool handler
- Improve error message handling to preserve safe user-facing error messages while blocking sensitive information
- Add regression test for metadata-only workout updates
