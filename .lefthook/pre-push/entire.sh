#!/bin/bash
# Entire pre-push: push session logs alongside the user's push.
# stdin carries git's "<local ref> <local oid> <remote ref> <remote oid>" lines.
command -v entire >/dev/null 2>&1 || exit 0
entire hooks git pre-push "$1"
