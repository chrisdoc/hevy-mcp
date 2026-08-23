---
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

Export the safe-error diagnostic vocabulary (codes, methods, categories, stack sources) from core as its interface; the Worker adapter validates against the shared vocabulary instead of private copies. Folds the safe-error-diagnostic re-export into error-policy.
