# Anti-slop lint policy review

This document records the repository-owned Oxlint plugin's current scope and
the evidence-based decisions for the three rules reviewed in issue #1179. The
plugin is not itself a goal: keep a custom rule only when it enforces a useful
invariant that is not already covered by a more direct check.

## Targeted decisions

The audit ran `mise exec -- pnpm exec oxlint .` on the review's base commit
(`148fa49`). It reported no violations for the three targeted rules. The only
diagnostic was one warning from `no-conditional-empty-object-spread`. This is
evidence of zero current findings, not a measured historical false-positive
rate.

| Rule                       | Failure it aimed to prevent                                             | Valid case or workaround the rule mishandles                                                                                                                                                                                                                                                                                                       | Decision                                                                                                                                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-runtime-typeof`        | Treating an untrusted value as a rich domain object without validation. | A `typeof value === "string"` branch safely narrows a primitive; it is not a substitute for schema validation. `packages/cli/src/input.ts` parses JSON as `unknown` and then validates it with Zod. The ban conflated these two jobs and currently found no violations.                                                                            | Remove. Let TypeScript's narrowing handle primitive checks; decode external structures at their boundary.                                                                                                                 |
| `no-unknown-parameters`    | Passing unconstrained values through internal APIs without validation.  | `loadMutationInput` in `packages/cli/src/input.ts` deliberately accepts a schema boundary value and returns `schema.parse(parsed)`. `packages/operations/src/operation-errors.ts` narrows `cause` with tagged-error checks; the old rule instead granted every parameter named `cause` a blanket exemption and used heuristic guard-name matching. | Remove the name/narrowing heuristic. Keep `unknown` visible at untrusted boundaries, validate there, and rely on TypeScript to reject unsafe use before narrowing. Do not replace this with another name-based exception. |
| `no-shape-in-symbol-names` | Avoid ambiguous local names near Zod's `.shape` API.                    | A standalone `shape` identifier can be a clear domain term and the exact-name ban also inspected private and JSX identifiers. It exempted `.shape` property access, so the actual Zod API remained usable. No current findings were reported.                                                                                                      | Remove. Prefer precise names in review when context warrants them; no repository-wide identifier ban is justified.                                                                                                        |

These decisions do not assert that primitive narrowing equals full schema
validation. A parser must still establish the domain contract. For example,
`typeof value === "string"` proves a primitive type, while
`schema.parse(value)` checks the complete schema. `value as DomainInput` does
not perform either runtime check; chained assertions, unsafe unvalidated use,
and ignored promises remain covered by the retained lint/type-check gates.

## Custom-rule inventory

There were ten custom rules in the base plugin. No dedicated rule tests existed
at the time of the audit. The repository-wide base run found one
`no-conditional-empty-object-spread` warning and no findings for the other nine
custom rules. `tests/unit/anti-slop-policy.test.ts` adds executable positive and
negative examples for the revised semantic boundary and the retained
assertion, promise, and focused-test safeguards.

| Rule                                 | Intended protection                                                                                       | Findings at base | Existing test coverage                              | Existing overlap or limitation                                                                                                                                      | Review outcome                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `no-broad-object-type`               | Reject bare `object` parameters that promise no useful contract.                                          | 0                | None dedicated.                                     | TypeScript checking catches unsafe property access, but not the weak API contract itself.                                                                           | Retain; keep the rationale local to the rule.                           |
| `no-chained-type-assertions`         | Reject `value as unknown as T`, which discards type evidence twice.                                       | 0                | No prior test; assertion example added.             | `no-widen-then-assert` covers a related widen-then-narrow pattern, not arbitrary assertion chains.                                                                  | Retain.                                                                 |
| `no-conditional-empty-object-spread` | Make optional-property presence explicit where serialization distinguishes absent from `undefined`.       | 1 warning        | None dedicated.                                     | No equivalent general-purpose rule captures this repository contract.                                                                                               | Retain at warning severity.                                             |
| `no-known-value-widening`            | Preserve literals and other known initializer evidence instead of widening immediately.                   | 0                | None dedicated.                                     | TypeScript permits explicit widening; `no-widen-then-assert` catches only a later subset of these flows.                                                            | Retain; add a focused case when a real finding warrants one.            |
| `no-unsafe-dictionary-type`          | Reject index-signature values that are `unknown`, `any`, `object`, `{}`, or include those escape hatches. | 0                | None dedicated.                                     | TypeScript checks uses after lookup but does not require a precise dictionary value contract.                                                                       | Retain; preserve owner/schema-derived dictionary types.                 |
| `no-unknown-type-aliases`            | Reject aliases that only rename `unknown`.                                                                | 0                | None dedicated.                                     | This is a naming/contract rule, not a replacement for checking unsafe operations.                                                                                   | Retain; unknown should remain explicit at a boundary.                   |
| `no-widen-then-assert`               | Reject a known value widened and later asserted back to a narrower type.                                  | 0                | None dedicated.                                     | Overlaps with `no-known-value-widening` for the initial loss of information and with `no-chained-type-assertions` for chained syntax; each catches a distinct flow. | Retain.                                                                 |
| `no-runtime-typeof`                  | Prefer decoding external values to ad-hoc runtime checks.                                                 | 0                | No prior test; primitive example added.             | Overbroad for sound primitive guards.                                                                                                                               | Remove.                                                                 |
| `no-shape-in-symbol-names`           | Prevent confusion between local identifiers and Zod's `.shape` API.                                       | 0                | No prior test; meaningful identifier example added. | Enforces an exact spelling rather than behavior.                                                                                                                    | Remove.                                                                 |
| `no-unknown-parameters`              | Force unknown parameters to be validated or narrowed.                                                     | 0                | None dedicated; boundary example added.             | `cause` name exception and syntax/name heuristics do not establish safety; rejects legitimate parser boundaries.                                                    | Remove; use explicit boundary parsing and TypeScript narrowing instead. |

The three removed rules had implementation and rationale comments but no
co-located executable tests. This PR deletes their dead implementations and
registrations; it does not remove any dependencies or unrelated custom rules.

## Repository examples

- `loadMutationInput` in `packages/cli/src/input.ts` shows a valid parser
  boundary: JSON is parsed as `unknown`, then passed to `schema.parse` before a
  typed value is returned.
- `isOAuthEnabled` and `validateAuthRequest` in
  `packages/worker/src/worker-oauth.ts` accept uncertain binding/payload data,
  check its structure, and return a boolean or parsed domain value.
- `errorIdentity` in `packages/operations/src/operation-errors.ts` accepts an
  `unknown` error cause and narrows it using `isHevyHttpError` and
  `instanceof NotFoundError`; this is safe because of the guards, not because
  the variable is named `cause`.
- `tests/package/npm-pack-smoke.mjs` uses runtime `typeof` checks to confirm
  imported public exports are functions. Those primitive checks are useful
  and do not replace decoding untrusted object payloads.

## Preserved safeguards and validation

The policy test runs Oxlint against realistic temporary source fixtures rather
than comparing configuration text. It confirms that schema parsing, primitive
narrowing, and a meaningful `shape` identifier are accepted; an unchecked
`unknown` property access still fails type checking; chained assertions,
floating promises, and focused tests still produce their dedicated lint
diagnostics.

Keep the broader safeguards enabled: `check:types`,
`typescript/no-floating-promises`, `vitest/no-focused-tests`,
`anti-slop/no-chained-type-assertions`, `anti-slop/no-widen-then-assert`, and
the package-boundary checks. This policy review does not migrate runtime code
or relax any of those categories.
