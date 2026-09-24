# Coding standards

Use the repository's [Ultracite](https://www.ultracite.ai/) configuration as
the source of truth for formatting and lint rules. Run `pnpm run check` to
validate and `pnpm run fix` to apply safe formatting and lint fixes.

For repository-specific workflow and architecture constraints, see
[AGENTS.md](./AGENTS.md), [CONTRIBUTING.md](./CONTRIBUTING.md),
[architecture.md](./docs/architecture.md), and
[test-lanes.md](./docs/test-lanes.md). Keep tests focused on observable
behavior and meaningful contracts rather than restating implementation details.
