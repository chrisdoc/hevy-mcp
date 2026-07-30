#!/usr/bin/env bash
set -euo pipefail

measurement="$(npm run measure:tokens)"
printf '%s\n' "$measurement"

total_tokens="$(printf '%s\n' "$measurement" | awk -F'Total: ' '/Tools:/ { split($2, fields, " "); print fields[1]; exit }')"
average_tokens_per_tool="$(printf '%s\n' "$measurement" | awk -F'Average: ' '/Tools:/ { print $2; exit }')"
input_schema_tokens="$(printf '%s\n' "$measurement" | awk '/Component totals:/ { for (i = 1; i <= NF; i++) if ($i ~ /^inputSchema=/) { split($i, fields, "="); print fields[2]; exit } }')"
output_schema_tokens="$(printf '%s\n' "$measurement" | awk '/Component totals:/ { for (i = 1; i <= NF; i++) if ($i ~ /^outputSchema=/) { split($i, fields, "="); print fields[2]; exit } }')"

[[ -n "$total_tokens" ]] || { printf 'Unable to parse total token count\n' >&2; exit 1; }
[[ -n "$average_tokens_per_tool" ]] || { printf 'Unable to parse average token count\n' >&2; exit 1; }
[[ -n "$input_schema_tokens" ]] || { printf 'Unable to parse input schema token count\n' >&2; exit 1; }
[[ -n "$output_schema_tokens" ]] || { printf 'Unable to parse output schema token count\n' >&2; exit 1; }

printf 'METRIC total_tokens=%s\n' "$total_tokens"
printf 'METRIC average_tokens_per_tool=%s\n' "$average_tokens_per_tool"
printf 'METRIC input_schema_tokens=%s\n' "$input_schema_tokens"
printf 'METRIC output_schema_tokens=%s\n' "$output_schema_tokens"
