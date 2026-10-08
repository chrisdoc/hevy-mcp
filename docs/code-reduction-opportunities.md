# Code reduction opportunities

## Fixed baseline and counting policy

Baseline: `1e0b1f660344` (2026-10-08). Count every tracked `.ts`, `.tsx`,
`.js`, `.mjs`, `.cjs`, `.cts`, and `.mts` file, including declarations and
hidden directories. Physical lines count newline-separated lines; nonblank
lines contain non-whitespace. Both include comments. JSON, documentation,
snapshots, and `.ts.fixture` files are not code in this metric. Keep this scope
fixed: moving code into excluded formats is not a reduction.

| Category                   |   Files | Physical lines | Nonblank lines |
| -------------------------- | ------: | -------------: | -------------: |
| Generated                  |     130 |          8,401 |          7,723 |
| Handwritten runtime        |     133 |         26,089 |         24,383 |
| Tests, fixtures, harnesses |     176 |         40,989 |         37,804 |
| Scripts and tooling        |      49 |          8,519 |          7,925 |
| Configuration              |      13 |            756 |            731 |
| **Total**                  | **501** |     **84,754** |     **78,566** |

Generated includes the Kubb output and the Entire extension. Generated output
remains part of the overall denominator and is unchanged by the first pass.
A 30% reduction requires at least **25,427 physical lines** and **23,570
nonblank lines** removed net of new helpers. Keeping generated output unchanged
requires reducing handwritten code by approximately 33.3%.

## Measured implementation pass

The validated first implementation removed **359 physical / 338 nonblank
lines net** (0.424% / 0.430%), including new helpers, the moved contract, and
46 added regression cases. That measured optimization revision contained 504
code files with 84,395 physical / 78,228 nonblank lines, before the subsequent
CI-policy regression checks. These actual savings are much smaller
than the reviewed opportunity estimates below; neither estimate nor relocation
is counted as an achievement. See the [measurement and validation report](performance-and-code-reduction.md).

## Reviewed opportunities

These are estimates, not achieved savings or proof of equivalent behavior.
Ranges are net of expected helper code. Path families avoid double-counting.

| Area                                                      | Estimated net physical lines | Constraints to verify                                                                  |
| --------------------------------------------------------- | ---------------------------: | -------------------------------------------------------------------------------------- |
| Operations test adapters and contract matrices            |                    600–1,000 | Argument counts, typed errors, first/later-page 404 behavior, case identities          |
| Core test operation factories and registration helpers    |                    650–1,000 | Explicit service injection, fresh fixtures, independently specified expected outputs   |
| Worker/OAuth request and flow fixtures                    |                    700–1,100 | Credential isolation, auth ordering, KV state, Node/Workerd differences                |
| Client test setup factories                               |                      450–750 | Retry budgets, clocks, timer cleanup, cancellation phases, ambiguous mutations         |
| Node and mocked-MCP transport/telemetry fixtures          |                      400–700 | Hoisted mocks, lifecycle cleanup, runtime-specific assertions                          |
| Repository filesystem fixtures and matrices               |                      400–650 | Diagnostic order/content, cache invalidation, no Git-based test fixtures               |
| Typed client facade factories                             |                      180–300 | All named signatures, Promise/Effect error differences, routine response normalization |
| Core response/registration/projection helpers             |                      150–250 | Exact text, output schemas, telemetry, omitted versus null fields                      |
| Operations interface structure and CLI pagination helpers |                      200–350 | Public interface compatibility, optional arguments, typed error channels               |
| Script validation/traversal structure                     |                      200–350 | Error order/messages, OpenAPI corrections, live/mutation gates                         |

The first pass plausibly offers **3,900–6,500 lines (4.6–7.6%)** after
validation. A deeper architectural pass might offer more, but a 30% overall
reduction is not supported by this audit. Approximately 19,000–21,500 lines of
additional safe reduction would still need evidence.

## Why not remove everything a scanner flags?

An exact-match scan found repeated 12-nonblank-line windows covering 2,362
lines across 48 files, including imports and both copies. That is candidate
coverage, not net removable code. The existing Knip report primarily identifies
unused export visibility, not dead implementations; removing `export` does not
remove functionality or meaningful lines of code.

Test request bridges have different dispatch, optional-argument, serialization,
and native Effect semantics. Node and Worker telemetry also have intentional
boundary-specific implementations. Do not replace these with a universal
helper without proving equivalence.

Do not count deleted test scenarios, comments/blank lines, readable declarations,
public barrels, minification, or moved fixtures as substantive simplification.
Generated reduction must be implemented through version-matched generator
configuration and independently checked, never by hand-editing output.

## Generated runtime follow-up

The installed `@kubb/plugin-fetch@5.5.3` always emits `.kubb/client.ts`,
`serializers.ts`, and `standardSchema.ts`. There is no supported custom-runtime
or omit-helper configuration switch. Although all handwritten facade calls use
our native transport, the 22 generated operations still import the bundled
runtime types, default client, and `withUnwrap`. Deleting these files would break
that dependency closure.

The supported `returnType: "plain"` option may save roughly 40–80 lines by
removing private unwrap decoration; the bundled helpers remain. Replacing
wrapper generation could remove roughly 2,730 physical / 2,521 nonblank lines
before replacement-code costs, but requires a deliberate generator/facade
redesign and full request/error/retry/cancellation equivalence checks. Neither
change has been implemented or counted as achieved savings. Do not depend on
private generator resolvers or suppress emitted files to force the target.

## Review and acceptance

Prioritize small typed factories and shared mechanics. Keep every scenario,
assertion, named lane, runtime matrix, and supported contract. Reuse existing
test harnesses rather than create a second one. Compare expanded test identities
when introducing parameterized cases; retain independent expected values so
helpers do not test themselves.

Use the validation baseline in CONTRIBUTING.md plus narrow affected lanes.
Record actual net physical and nonblank reductions separately from these
estimates. Stop before a percentage target would require changing behavior or
weakening verification.
