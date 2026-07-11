---
"hevy-mcp": patch
---

Isolate pull request previews on a dedicated Worker that is safely bootstrapped
on first use, while keeping production deployments restricted to trusted main
branch CI and the custom production domain.
