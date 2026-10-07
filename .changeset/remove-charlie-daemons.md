---
"hevy-mcp": patch
---

Remove `.agents/daemons/` daemon definitions: the Charlie agent that ran them is no longer active, so the daemon specs (docs-drift-maintainer, pr-check-repair, pr-merge-conflict-repair, pr-metadata, triage-sentry-issues) are dead configuration.
