# @chrisdoc/hevy-cli

Read-only command-line access to the Hevy API.

```sh
npm install -g @chrisdoc/hevy-cli
export HEVY_API_KEY=your-key
hevy --help
```

Supported commands are `user`, `workouts list|get|count|events`, `routines
list|get`, `exercises search|get|history`, `measurements list|get`, and
`summary --weeks N`. Use `--json` for one stable JSON value on stdout; normal
output is a compact human-readable rendering. Pagination defaults to the API
defaults and is bounded to 10 items (100 for exercise-template search).
Search and summary report `pagesScanned` and `complete` when they scan multiple
pages. The MVP does not mutate data.

Credentials are accepted only from `HEVY_API_KEY`; keys in arguments or URLs
are unsupported. Stricli handles command routing, flags, and primitive parsing;
semantic values are validated with Zod schemas derived from the Hevy client API
contracts. Errors are sent as one sanitized line to stderr and success output to
stdout. Usage, validation, and configuration errors exit 2; API failures exit 3,
and network/timeout failures exit 4. Semantic validation happens before
any API request, and Zod implementation details are not exposed in diagnostics.
