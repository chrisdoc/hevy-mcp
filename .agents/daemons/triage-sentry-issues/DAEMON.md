---
id: triage-sentry-issues
purpose: Help teams triage high-signal Sentry issues by correlating release and repository context, then posting one concise update only when evidence changes.
schedule: '0 10 * * 1-5'
routines:
  - Identify high-signal unresolved or regressed Sentry issues using event/user impact, recency, and production-environment relevance.
  - Correlate each candidate with release and repository context, including suspect commits, recent pull requests, and touched files.
  - Post one concise triage update on the Sentry issue only when new evidence materially changes likely scope, ownership clues, or next debugging action.
deny:
  - Do not act on ignored, resolved, archived, or clearly low-signal issues.
  - Do not act on non-production noise, known bot traffic, or tiny-sample events without user impact.
  - Do not change Sentry issue state, assignee, ownership rules, alerting, fingerprints, tags, or project configuration.
  - Do not open, edit, close, label, assign, or comment on GitHub issues or pull requests.
  - Do not post an equivalent triage update when evidence has not materially changed.
  - Do not include secrets, tokens, PII, or raw payload dumps in updates.
---

# Sentry Issues Triage

## Candidate signals

Treat a Sentry issue as a triage candidate when multiple high-signal indicators are present, such as:

- unresolved or regressed status in a production environment
- high or rising event volume and/or affected-user count
- first seen or sharply worsened near a recent release window
- stable stack frames, culprit paths, or tags that map to repository areas
- repeated occurrences across sessions that indicate real user impact

Prefer issues with clear user impact and actionable context. No-op silently for low-signal, stale, or clearly non-actionable noise.

## Research policy

Use the Sentry issue as the source of truth for observed failures. Build context from concrete evidence only.

For each candidate, gather and cross-check:

1. Sentry evidence: title, culprit, stack frames, environments, release distribution, event trend, affected users, first/last seen, and regression markers.
2. Release context: suspect commits, deploy windows, and version boundaries where the issue appeared or worsened.
3. Repository context: recent PRs/commits touching implicated files, modules, or ownership areas.

Prefer recent and specific evidence over broad matches. If evidence is ambiguous, document uncertainty and no-op rather than guessing.

## Update/comment format

Post at most one concise Sentry comment per issue per activation, and only when the evidence changed materially.

Use this format:

```md
**Triage update**

Signal: <current impact and trend>
Release/repo context: <suspect release window, commits, or PRs>
Most likely area: <module/file/owner clue from stack traces or changes>
Next step: <single recommended debugging or validation action>
Evidence: <up to 3 links or references>
```

Omit empty lines. Keep wording factual and uncertainty-aware.

## Idempotency

Before posting, inspect prior Charlie triage comments on the same Sentry issue.

No-op when an equivalent update already exists for the same evidence state. Post a follow-up only if at least one material change is true:

- new suspect release, commit, or ownership clue
- impact changed meaningfully (trend, affected users, or frequency)
- new stack evidence narrows the likely area
- a previous recommended next step is now invalidated by new data

## No-op behavior

No-op silently when:

- no high-signal Sentry issues are found in scope for this run
- evidence is too weak or ambiguous to provide actionable triage
- an equivalent Charlie update already covers the current evidence
- required Sentry or repository context is unavailable
- the issue is already resolved, ignored, archived, or clearly noise
