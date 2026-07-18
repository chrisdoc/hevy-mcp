---
"hevy-mcp": minor
---

Add an optional OAuth 2.1 layer to the Cloudflare Worker so remote MCP clients such as Claude.ai custom connectors can connect without a fixed Authorization header. When an `OAUTH_KV` namespace is bound, the Worker serves RFC 8414 / RFC 9728 discovery metadata, dynamic client registration, and PKCE token exchange, plus an `/authorize` page that validates the submitted Hevy API key against Hevy and stores it encrypted inside the OAuth grant. Without the binding, Worker behavior is unchanged, and direct Hevy-API-key bearer requests keep working in both modes.
