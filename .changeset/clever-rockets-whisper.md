---
"hevy-mcp": patch
---

Add a shared bounded TTL async cache utility and migrate exercise template
catalog caching in `search-exercise-templates` to use it. This keeps cache
behavior consistent (TTL, LRU bound, refresh invalidation, and in-flight
request de-duplication) and adds tests plus README documentation.
