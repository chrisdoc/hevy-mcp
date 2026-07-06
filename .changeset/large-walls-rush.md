---
"hevy-mcp": patch
---

Fix exercise template catalog caching so a failed in-flight fetch is not
reused as a rejected promise and subsequent searches retry naturally.
