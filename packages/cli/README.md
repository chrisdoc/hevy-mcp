# hevy-cli

Read-only command-line access to the Hevy API.

```sh
npm install -g hevy-cli
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
are unsupported. Errors are sent to stderr and success output to stdout. Exit
codes are 1 for configuration, 2 for usage/validation, 3 for API failures, and
4 for network/timeout failures.
