# @chrisdoc/hevy-cli

A read-only command-line client for the Hevy API. Use it to inspect workouts,
routines, exercises, and body measurements from your terminal, or add `--json`
to pipe the results into another tool.

The CLI does not create, update, or delete Hevy data.

## Requirements

- Node.js 24 or newer
- A Hevy PRO account and API key

## Install

```sh
npm install -g @chrisdoc/hevy-cli
export HEVY_API_KEY=your-hevy-api-key
hevy --help
```

The CLI reads credentials only from `HEVY_API_KEY`. It does not accept API keys
in command arguments or URLs.

## Examples

```sh
# List 10 workouts
hevy workouts list --page-size 10

# Search the exercise catalog
hevy exercises search "bench press"

# Review an exercise over a date range
hevy exercises history <exercise-template-id> \
  --start-date 2026-07-01T00:00:00Z \
  --end-date 2026-07-31T23:59:59Z

# Summarize the last four weeks
hevy summary --weeks 4

# Pipe one JSON value to jq
hevy routines list --json | jq
```

Run `hevy <command> --help` for the flags and arguments accepted by a command.

## Commands

| Command                                                                                             | What it returns                                   |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `hevy user`                                                                                         | Your Hevy user profile                            |
| `hevy workouts list [--page N] [--page-size N]`                                                     | A page of workouts                                |
| `hevy workouts get <workout-id>`                                                                    | One workout                                       |
| `hevy workouts count`                                                                               | Your workout count                                |
| `hevy workouts events --since <timestamp> [--page N] [--page-size N]`                               | Workout events since an ISO timestamp             |
| `hevy routines list [--page N] [--page-size N]`                                                     | A page of routines                                |
| `hevy routines get <routine-id>`                                                                    | One routine                                       |
| `hevy exercises search <query> [--max-pages N]`                                                     | Exercise templates whose titles contain the query |
| `hevy exercises get <exercise-template-id>`                                                         | One exercise template                             |
| `hevy exercises history <exercise-template-id> [--start-date <timestamp>] [--end-date <timestamp>]` | History for one exercise                          |
| `hevy measurements list [--page N] [--page-size N]`                                                 | A page of body measurements                       |
| `hevy measurements get <YYYY-MM-DD>`                                                                | Body measurements for one date                    |
| `hevy summary [--weeks N]`                                                                          | Workout totals for a recent period                |

Add `--json` to any command for machine-readable output.

## Pagination and scans

List commands default to page 1 with 5 results per page. `--page-size` accepts
up to 10. Summary defaults to one week and accepts up to 520.

Exercise search checks up to 10 API pages, with 100 templates per page. Use
`--max-pages N` to change the limit, up to 100. Search and summary results
include `pagesScanned` and `complete` so scripts can tell whether a scan reached
the end of the available data.

## Output and exit codes

Human-readable output is the default. With `--json`, successful commands write
one JSON value followed by a newline to stdout. Errors write one sanitized line
to stderr.

| Exit code | Meaning                          |
| --------- | -------------------------------- |
| `0`       | Success                          |
| `1`       | Missing or invalid configuration |
| `2`       | Invalid command, flag, or value  |
| `3`       | Hevy API failure                 |
| `4`       | Network or timeout failure       |
