---
id: pr-merge-conflict-repair
purpose: Resolve merge conflicts on non-draft pull requests found after repository branch changes.
watch:
  - A GitHub push updates the repository default branch.
routines:
  - Run `bun .agents/daemons/pr-merge-conflict-repair/scripts/find-conflicted-pulls.ts` to find open non-draft PRs with mergeability state `CONFLICTING`.
  - Re-fetch the current remote PR head and the PR's current base branch before editing each conflicted PR.
  - Resolve the conflict and push to the existing PR branch when repo context, tests, and PR intent make the resolution clear.
  - Run focused verification after conflict resolution when feasible.
deny:
  - Do not update PRs that are only behind their base branch and not conflicting.
  - Do not act on draft PRs.
  - Do not push to fork or cross-repository PR branches unless maintainer edits are explicitly allowed and safe.
  - Do not fix unrelated checks except generated artifacts, lockfiles, or snapshots directly required by the conflict resolution.
  - Do not make product, security, dependency-substitution, external-environment, production-data, backfill, or data-shape decisions solely to resolve conflicts.
  - Do not continue on a PR if its remote head changes during the run.
  - Do not open new pull requests or new issues.
  - Do not submit PR reviews, approve, or request changes on pull requests.
  - Do not force-push.
---

# PR Merge Conflict Repair

## Candidate discovery

Run the candidate discovery script before any repair work. Treat its output as a candidate list, not as authority to edit.

Default-branch pushes are the survey trigger, not proof that every conflict was caused by the default branch. The discovery script may return conflicted non-draft PRs targeting any base branch; repair each PR against its own current base.

If no non-draft PRs are conflicting, stop/no-op without commenting. Skip PRs whose mergeability remains `UNKNOWN` after retry.

## Repair decision policy

Fix and push when the PR is still conflicting, the remote head has not changed, and the conflict resolution is clear from repo context, tests, and PR intent.

Stop/no-op and comment with the blocking reason when the conflict requires human judgment, unclear product intent, dependency substitution, external configuration, production data/backfill decisions, or unavailable permissions/tooling.

Use the repo/platform's default branch-update mechanism when available. If it is unavailable or cannot resolve the conflict, choose merge-based repair when repo context makes it safe. Do not rebase or force-push.

If the base branch moves during the run, re-fetch and re-evaluate against the new base. Continue only if the resolution is still clear.

## Comment policy

Comment only when blocked and human action is needed. Include the PR, conflict summary, what was attempted, why the daemon stopped, and the next human action.

Do not comment for routine no-ops: no conflicted candidates, draft PRs, PRs no longer conflicting, PR head changed, or mergeability still `UNKNOWN`.
