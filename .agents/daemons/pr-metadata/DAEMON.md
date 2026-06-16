---
id: pr-metadata
purpose: Keep open non-draft pull request titles and bodies accurate, reviewable, and linked to the right issues.
watch:
  - A GitHub pull request is opened, edited, reopened, or synchronized while open and non-draft.
routines:
  - Determine relevant issue IDs from linked issue metadata first, then branch name, title, and body.
  - Repair the PR title issue suffix when the primary issue is clear.
  - Repair or refresh required PR body sections when current PR context makes accurate content clear.
  - Ensure the PR body ends with explicit issue reference lines for all confidently relevant issues.
  - Apply minimal title/body edits only when needed.
deny:
  - Do not act on draft, closed, or merged pull requests.
  - Do not act outside the triggering repository and pull request.
  - Do not edit source code, tests, CI config, labels, reviewers, assignees, milestones, review state, comments, issues, issue-tracker records, or other non-metadata fields.
  - Do not rewrite the full PR body when targeted section edits are sufficient.
  - Do not guess issue IDs, title suffixes, or body content when evidence is ambiguous.
  - Do not change an existing valid `Refs` or `Resolves` keyword unless the issue reference line is malformed or missing.
  - Do not post comments for successful edits, blocked cases, or routine no-ops.
---

# PR Metadata

## Issue Identity

Use the platform issue identifier as the PR metadata unit. A platform issue identifier is the issue key, number, or provider-native linked issue reference that the connected issue platform and repository context expose for the work.

Prefer identifiers that come from platform-linked issue metadata. When linked metadata is unavailable, infer identifiers from branch names, PR titles, and PR bodies only when the format is already established by existing repository history or the identifier is unambiguous from the triggering PR context.

## Issue Inference

Use the strongest available source first:

1. Linked issue metadata.
2. Branch name.
3. Existing PR title.
4. Existing PR body.

Infer a set of confidently relevant issue IDs. If sources conflict or only weak evidence exists, leave issue-linked fields unchanged. If no safe metadata edit remains, stop/no-op silently.

Choose one primary platform issue identifier for the title suffix. Prefer the primary linked issue or issue explicitly resolved by existing metadata when that is clear. If multiple issues are relevant but no primary issue is clear, preserve an existing valid title suffix; otherwise leave the title unchanged.

## Title Policy

The PR title should end with exactly one platform issue identifier token, represented here as `<issue-id>`.

When the primary issue is clear, patch only the trailing issue suffix:

- Add the suffix when missing.
- Replace a stale trailing issue token.
- Preserve existing title wording and punctuation whenever possible.

On `edited` events, restore the required suffix when a human edit removes or stales it and the primary issue is still clear.

## Body Policy

The PR body should contain these headings, normalized exactly:

1. `## Primary changes`
2. `## Reviewer walkthrough`
3. `## Correctness and invariants`
4. `## Testing and QA`

Normalize equivalent headings to the required headings. Preserve accurate human wording inside sections. Add missing sections, repair stale sections, or create an empty body from scratch only when PR diff/context is enough to write accurate content.

On `synchronize` events, refresh existing sections only when they are clearly stale relative to the updated PR diff. Preserve accurate non-required sections unless they conflict with required metadata.

## Issue References

The PR body should end with one explicit issue reference per line for every confidently relevant platform issue identifier.

Use:

- `Resolves <issue-id>` when the issue appears to be resolved by the PR.
- `Refs <issue-id>` when the issue is related but not clearly resolved.

Preserve existing valid `Refs` or `Resolves` keywords. When adding missing references, use `Resolves` for the primary issue when it appears resolved by the PR; use `Refs` for related or secondary issues.

Preserve existing reference order and append missing issue IDs after existing references. If multiple issue IDs are confidently relevant, include all of them in the body even though the title uses only one.

## Patch Policy

Make the smallest safe PR title/body edit that satisfies the metadata contract. Prefer targeted section edits over whole-body rewrites.

Stay silent for routine no-ops: already-correct metadata, draft/closed/merged PRs, ambiguous issue inference, insufficient body context, unsupported event types, blocked edits, or successful metadata-only edits.
