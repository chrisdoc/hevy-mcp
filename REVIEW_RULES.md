# Review Rules

Review only the changed code. Report concrete, actionable violations on changed
lines; do not speculate about unrelated code.

- Do not manually edit files under `src/generated/`. Generated API client
  changes must come from the configured generation workflow.
- Define tool parameter schemas with Zod and infer handler parameter types with
  `InferToolParams<typeof schema>`.
- Do not use `as any` or `as unknown` assertions in tool handlers.
- Wrap every tool handler with `withErrorHandling` and an appropriate context
  name.
- Never commit `.env` files, API keys, credentials, tokens, or other secrets.
- Follow the configured formatter: use tabs for indentation and double quotes
  where the project configuration requires them.
- Every source-code or dependency change requires a changeset. Use a versioned
  changeset only for user-facing, runtime-visible changes; use
  `npx changeset --empty` for docs, CI, tests, refactors, and other
  internal-only changes.
- After upgrading `@modelcontextprotocol/sdk`, rerun the stdio observability
  test suite because it depends on SDK stdio internals.
