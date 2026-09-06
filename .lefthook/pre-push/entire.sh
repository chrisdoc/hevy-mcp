#!/bin/bash
# Entire pre-push: push session logs alongside the user's push.
# stdin carries git's "<local ref> <local oid> <remote ref> <remote oid>" lines.
command -v mise >/dev/null 2>&1 || { echo "mise not found; entire pre-push step skipped" >&2; exit 0; }
mise exec -- entire hooks git pre-push "$1"
