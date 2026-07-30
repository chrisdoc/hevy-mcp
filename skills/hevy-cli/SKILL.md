---
name: hevy-cli
description: "Manage Hevy workouts from the terminal: read and summarize training data, search exercise templates, and create or update workouts, routines, exercises, folders, or body measurements."
---

# Hevy CLI

Use this skill to manage workouts in the Hevy app.
The CLI supports reads, creates, and updates. Deletion is unsupported.

## 1. Install or run the published package

```sh
# One-off use; npm downloads the published package when needed.
npx @chrisdoc/hevy-cli --help

# Local project install.
npm i @chrisdoc/hevy-cli
npx hevy --help

# Persistent global install.
npm i -g @chrisdoc/hevy-cli
hevy --help
```

The package requires Node.js 24 or newer. Use `npx --yes
@chrisdoc/hevy-cli ...` in non-interactive scripts. Installation is verified
when `npx @chrisdoc/hevy-cli --version` or `hevy --version` prints a version.

## 2. Configure the API key

The CLI reads credentials only from `HEVY_API_KEY`:

```sh
export HEVY_API_KEY='<your-hevy-api-key>'
```

Keep the key out of command arguments, JSON payloads, URLs, shell history,
screenshots, logs, and responses. `--help` and `--version` work without it.

## 3. Choose a route

Read routes:

- `user`
- `workouts list`, `workouts get`, `workouts count`, `workouts events`
- `routines list`, `routines get`
- `exercises search`, `exercises get`, `exercises history`
- `measurements list`, `measurements get`
- `summary`

Create/update routes:

- `workouts create`, `workouts update <workout-id>`
- `routines create`, `routines update <routine-id>`
- `exercises create`
- `folders create`
- `measurements create <YYYY-MM-DD>`, `measurements update <YYYY-MM-DD>`

The CLI exposes no delete, update-exercise-template, or update-folder routes.
If a user requests deletion of any resource, explain that deletion is not
supported by the CLI or the Hevy API integration. Suggest a supported
alternative, such as archiving the resource in Hevy if available or replacing
it.

Run route help whenever a flag or argument is uncertain:

```sh
npx @chrisdoc/hevy-cli <command> --help
```

Use the narrowest read route and date/page range that answers the question.
Use `--json` when output will be searched, filtered, or piped.

For exercise work, search first and use the exact returned template ID. Create
a custom exercise only when the required movement is absent:

```sh
npx @chrisdoc/hevy-cli exercises search "bench press" --json
npx @chrisdoc/hevy-cli exercises history <exercise-template-id> \
  --start-date 2026-07-01T00:00:00Z \
  --end-date 2026-07-31T23:59:59Z \
  --json
```

## 4. Supply mutation data safely

Every create/update requires `--data <value>` and an explicit `--yes`.
`--noYes`, omission, or any value other than `true` is rejected before the
CLI reads a file/stdin or calls Hevy. `--data` accepts inline JSON, `@path`
for a UTF-8 JSON file, or `@-` for JSON from stdin. Keys are camelCase and
payloads are wrapperless; do not submit `{ "workout": ... }` or snake_case.

```sh
# Inline folder creation
npx @chrisdoc/hevy-cli folders create \
  --data '{"name":"Strength"}' --yes

# Workout creation from a file
npx @chrisdoc/hevy-cli workouts create \
  --data @workout.json --yes --json

# Piped full routine replacement
cat routine.json | npx @chrisdoc/hevy-cli routines update routine-123 \
  --data @- --yes --json

# Numeric measurement update
npx @chrisdoc/hevy-cli measurements update 2026-07-27 \
  --data '{"weightKg":80.5}' --yes --json

# Explicit-null measurement clearing
npx @chrisdoc/hevy-cli measurements update 2026-07-27 \
  --data '{"fatPercent":null}' --yes --json
```

Workout and routine updates are full replacements. Include every exercise and
set that should remain; omitted content is not preserved. A routine update
cannot move a routine to another folder because Hevy's PUT endpoint has no
`folderId`.

Measurement updates are patches over Hevy's replacement PUT. The CLI reads the
existing date first, preserves omitted fields, replaces supplied numbers, and
uses explicit `null` to clear a field. Measurement create needs at least one
numeric field; update needs at least one supplied field. The date is the
positional argument and cannot appear in `--data`.

## 5. Handle writes and errors

Writes are never retried automatically. Creates are not idempotent, and an
uncertain network result may already have committed. Verify an uncertain write
with a read before deciding whether to retry. A duplicate measurement date is
an API conflict (HTTP 409). HTTP 403 is a generic API failure because Hevy also
uses it for routine and custom-exercise quotas.

When HTTP 403 occurs, report it as a generic API failure rather than an invalid
API key. Check the operation's permissions and routine/custom-exercise quota.
HTTP 401 is the authentication failure that should prompt checking
`HEVY_API_KEY`.

Successful `--json` commands write one JSON value plus newline to stdout.
Errors write one sanitized line to stderr. Exit codes:

- `0` — success
- `1` — missing or invalid configuration
- `2` — invalid command, flag, payload, or value
- `3` — Hevy API failure
- `4` — network or timeout failure

Use `YYYY-MM-DD` for measurement dates and ISO timestamps with timezone
offsets for history/event filters. Quote user-provided queries and IDs.
