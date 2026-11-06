---
"hevy-mcp": patch
"@hevy-mcp/core": patch
---

`search-exercise-templates` no longer fails on every call when loading the exercise catalog takes longer than one call's time limit. A caller that times out now leaves the shared catalog load running, so the next call gets the cached result. `get-workouts` now advertises `page` as an integer and rejects fractional pages before calling Hevy.
