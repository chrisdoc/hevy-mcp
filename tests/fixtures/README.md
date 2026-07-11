# Sanitized integration fixtures

Fixtures in this directory model upstream payload shapes needed for deterministic
regression tests. They are recreated from public API contracts and observed
failure classes, not copied from user payloads.

- Use stable placeholder IDs, titles, timestamps, and measurements.
- Remove names, free-form notes, account identifiers, and other user values.
- Name fixtures after the upstream variant and regression behavior they cover.

## Fixture provenance

| Exact filename                                    | Source category and date                                                                                                           | Redactions and placeholders                                                                                                                                                                                    | Protected regression behavior                                                                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workout-event-updated-extra-fields.sanitized.ts` | Synthesized on 2026-07-11 from the public workout-event contract and the extra-field failure class observed in PR #594.            | Replaces workout, exercise-template, title, timestamps, and exercise values with deterministic `fixture-*`/`Sanitized *` placeholders; removes all account identifiers, names, notes, and user-derived values. | An updated event may contain upstream-only workout and exercise fields; formatting must strip them while production `structuredContent` validation and legacy text parity continue to pass. |
| `workout-event-deleted.sanitized.ts`              | Synthesized on 2026-07-11 from the public deleted-event contract and the event-normalization failure class exercised with PR #594. | Replaces the workout ID and deletion timestamp with deterministic fixture values; includes only a synthetic upstream-only marker and no account or user-derived data.                                          | A deleted event must normalize `deleted_at` to `deletedAt`, remove upstream-only fields, and satisfy the production event output schema with matching legacy text.                          |
