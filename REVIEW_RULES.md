# Review Rules

Review only the changed code. Report concrete, actionable violations on changed
lines; do not speculate about unrelated code.

- Do not manually edit files under `packages/hevy-client/src/generated/`.
  Generated API client
  changes must come from the configured generation workflow.
- Define tool parameter schemas with Zod and infer handler parameter types with
  `InferToolParams<typeof schema>`.
- Do not use `as any` or `as unknown` assertions in tool handlers.
- Wrap every tool handler with `withErrorHandling` and an appropriate context
  name.
- Never commit `.env` files, API keys, credentials, tokens, or other secrets.
- Follow the configured formatter: use tabs for indentation and double quotes
  where the project configuration requires them.
- The root is a private repository orchestrator; runtime/package code and
  manifests are under `packages/*`.
- Files under `packages/*`, runtime-visible behavior changes, workspace package
  dependency changes, and explicit release triggers such as
  `cloudflare.config.ts` require a non-empty bump Changeset naming every affected
  package.
- An empty Changeset is allowed only when the entire PR is no-release/internal-
  only and changes no workspace package or explicit release trigger; it cannot
  accompany a release-triggering change. Docs, CI, repository-only
  tests/tooling, and chores may qualify only when they meet those conditions.
- A Conventional Commit type alone does not determine empty-Changeset
  eligibility.
- After upgrading the MCP TypeScript SDK packages, rerun the stdio observability
  test suite because it depends on SDK stdio internals.
