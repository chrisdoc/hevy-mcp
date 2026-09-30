---
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
---

Improve worker error logging and classify transport client rejections as warnings to prevent false-positive alerts in Cloudflare Real-Time Issue Detection while preserving safe diagnostic sanitization.
