#!/bin/bash
command -v mise >/dev/null 2>&1 || { echo "mise not found; control-plane pre-push step skipped" >&2; exit 0; }
mise exec -- npx nx run repository:pre-push
