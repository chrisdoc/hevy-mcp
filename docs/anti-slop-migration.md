# Anti-slop migration

The anti-slop Oxlint plugin is enabled at `error` severity for all ten rules.

## First migration batch

This change migrates omission-preserving response projection helpers in
`packages/core/src/utils/response-contracts.ts` to `optionalProperty()`. The
helper keeps absent and `null` values omitted from serialized response objects;
this is intentional because changing these to `key: undefined` would alter the
in-memory contract and risk changing downstream serialization behavior.

## Remaining baseline

The repository-wide gate still reports existing findings outside this first
batch. The largest groups are:

- runtime `typeof` checks in boundary and compatibility code,
- `unknown` parameters in error/reporting callbacks,
- conditional object spreads in telemetry and response builders,
- legacy symbol names containing `shape`,
- test doubles using chained assertions.

These need separate, behavior-focused migrations. The plugin remains enabled
for all rules so new violations are visible rather than suppressed.
