# Historical control-plane baseline

[`repository/control-plane-baseline.json`](../repository/control-plane-baseline.json)
is retained as migration evidence from the original control-plane adoption.
It is intentionally archival: active validation reads the canonical topology,
artifact, and validation-lane models directly and does not compare them with
the historical baseline or an old Git revision.
