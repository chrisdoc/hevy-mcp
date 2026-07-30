# @chrisdoc/hevy-cli

The `@chrisdoc/hevy-cli` package is a terminal client for the Hevy API. It
supports read commands plus create and update commands for workouts, routines,
custom exercise templates, routine folders, and body measurements. Deletion is
not supported.

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
in command arguments, JSON payloads, or URLs.

## Examples

Read commands do not require confirmation:

```sh
# List 10 workouts
hevy workouts list --page-size 10

# Search the exercise catalog
hevy exercises search "bench press"

# Pipe one JSON value to jq
hevy routines list --json | jq
```

Mutation commands require both `--data` and an explicit `--yes`:

```sh
# Create a folder from an API-shaped snake_case envelope
hevy folders create --data '{"routine_folder":{"title":"Strength"}}' --yes

# Create a workout from a UTF-8 JSON file
hevy workouts create --data @workout.json --yes --json

# Replace a routine from JSON piped on stdin
cat routine.json | hevy routines update routine-123 --data @- --yes --json

# Patch one measurement field
hevy measurements update 2026-07-27 \
  --data '{"date":"2026-07-27","weight_kg":80.5}' --yes --json

# Explicit nulls are validated but omitted from the API PUT body
hevy measurements update 2026-07-27 \
  --data '{"date":"2026-07-27","fat_percent":null}' --yes --json
```

`--data` accepts inline JSON, `@path` for a UTF-8 file, or `@-` for stdin.
Mutation JSON uses strict snake_case API envelopes: `workout`, `routine`,
`exercise`, and `routine_folder`. Measurement JSON includes its `date`.
The CLI validates the complete payload before making an API request.

## Commands

### Read

| Command                                                                                             | What it returns                       |
| --------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `hevy user`                                                                                         | Your Hevy user profile                |
| `hevy workouts list [--page N] [--page-size N]`                                                     | A page of workouts                    |
| `hevy workouts get <workout-id>`                                                                    | One workout                           |
| `hevy workouts count`                                                                               | Your workout count                    |
| `hevy workouts events --since <timestamp> [--page N] [--page-size N]`                               | Workout events since an ISO timestamp |
| `hevy routines list [--page N] [--page-size N]`                                                     | A page of routines                    |
| `hevy routines get <routine-id>`                                                                    | One routine                           |
| `hevy exercises search <query> [--max-pages N]`                                                     | Exercise templates matching the query |
| `hevy exercises get <exercise-template-id>`                                                         | One exercise template                 |
| `hevy exercises history <exercise-template-id> [--start-date <timestamp>] [--end-date <timestamp>]` | History for one exercise              |
| `hevy measurements list [--page N] [--page-size N]`                                                 | A page of body measurements           |
| `hevy measurements get <YYYY-MM-DD>`                                                                | Measurements for one date             |
| `hevy summary [--weeks N]`                                                                          | Workout totals for a recent period    |

### Create and update

| Command                                                      | Payload                                       |
| ------------------------------------------------------------ | --------------------------------------------- |
| `hevy workouts create --data <value> --yes`                  | Complete workout                              |
| `hevy workouts update <workout-id> --data <value> --yes`     | Complete replacement workout                  |
| `hevy routines create --data <value> --yes`                  | Complete routine, optionally with `folder_id` |
| `hevy routines update <routine-id> --data <value> --yes`     | Complete replacement routine                  |
| `hevy exercises create --data <value> --yes`                 | Custom exercise template                      |
| `hevy folders create --data <value> --yes`                   | Routine folder                                |
| `hevy measurements create <YYYY-MM-DD> --data <value> --yes` | New body measurement                          |
| `hevy measurements update <YYYY-MM-DD> --data <value> --yes` | Measurement patch                             |

There is no delete command, update-template command, or update-folder command.

## Payloads and safety

Workout and routine updates are full replacements. Include every exercise and
set that should remain; omitted content is not preserved. A workout update
requires the same complete workout payload as creation. A routine update cannot
move a routine between folders because Hevy's update endpoint does not accept
`folder_id`.

Measurement updates are patches over Hevy's replacement PUT endpoint. The CLI
reads the existing date first, preserves omitted fields, replaces supplied
numbers, and omits explicit `null` values because the API rejects them. The
date must appear in `--data` and match the positional `YYYY-MM-DD` argument.
Measurement creation needs at least one numeric field; update needs at least
one supplied field.

Writes are never retried automatically. Creates are not idempotent, and an
uncertain network result can still have committed. Verify an uncertain write
with a read before deciding whether to retry. A duplicate measurement date is
reported by Hevy as HTTP 409. HTTP 403 is reported as a generic API failure
because Hevy uses it for permissions and routine/custom-exercise quotas.

## Pagination, output, and exit codes

List commands default to page 1 with 5 results per page. `--page-size` accepts
up to 10. Summary defaults to one week and accepts up to 520. Exercise search
checks up to 10 API pages, with 100 templates per page; `--max-pages` accepts
up to 100.

Add `--json` to any command for machine-readable output. Successful commands
write one JSON value followed by a newline to stdout. Errors write one
sanitized line to stderr.

| Exit code | Meaning                                  |
| --------- | ---------------------------------------- |
| `0`       | Success                                  |
| `1`       | Missing or invalid configuration         |
| `2`       | Invalid command, flag, payload, or value |
| `3`       | Hevy API failure                         |
| `4`       | Network or timeout failure               |
