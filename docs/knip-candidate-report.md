# Knip removal-candidate report

This report captures the first full analysis after narrowing Knip roots for
issue #1172. It is evidence for follow-up review, not authorization to delete
code or change package contracts.

The source paths in the findings below describe the layout at the recorded
analysis revision. The Core diagnostic modules were subsequently grouped under
`packages/core/src/diagnostics/` by the responsibility refactor in #1175; this
move does not change the candidate decisions or their evidence.

## Pre-change baseline

The baseline is the parent of the Knip configuration change,
`d4a984cdb8aad0ab4090a24f7e4e4de2ec198b09`. It used the broad `.agents`,
`.github/workers`, config-file, and `scripts/**/*` entry patterns. The lockfile
pins Knip 6.35.1. At that revision, `pnpm run knip` excluded
`unlisted,unresolved,exports,types,duplicates` and exited 0 with no findings in
the remaining `files` and `dependencies` categories.

Running the same pinned Knip version against the parent configuration with all
issue types enabled produced this fuller baseline:

| Issue type                             | Findings | Baseline detail                                                                                                                                                                                    |
| -------------------------------------- | -------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unused files                           |        0 | —                                                                                                                                                                                                  |
| Unused dependencies                    |        0 | —                                                                                                                                                                                                  |
| Unlisted dependencies                  |        4 | `cloudflare` in `packages/worker/src/worker-observer.ts` and `tests/cloudflare/worker.integration.test.ts`; `effect` in `scripts/measure-token-cost.ts` and `tests/integration/catalog-fixture.ts` |
| Unused value exports                   |       26 | Visibility candidates; not proof that implementations are dead                                                                                                                                     |
| Unused exported types                  |       23 | Visibility candidates; not proof that types are safe to remove                                                                                                                                     |
| Duplicate exports                      |        4 | Two compatibility-alias pairs in three files                                                                                                                                                       |
| Unlisted binaries / unresolved imports |        0 | —                                                                                                                                                                                                  |

At the baseline, the legacy `pnpm run knip` gate exits 0; the full command
below exits 1 because these advisory diagnostics are present. Both outcomes
are expected at that revision.

To reproduce from a checkout with the pinned toolchain and dependencies, use
that revision's unmodified config:

```sh
git worktree add --detach ../hevy-mcp-knip-baseline d4a984cdb8aad0ab4090a24f7e4e4de2ec198b09
cd ../hevy-mcp-knip-baseline
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm run knip
mise exec -- pnpm exec knip --reporter compact --no-progress
```

This baseline is not directly comparable to the post-change count: the narrowed
entry graph changes which files and exports Knip can prove reachable. It does
show which diagnostics the old default command concealed.

## Run and outcome

- Tool: Knip 6.35.1, pinned through the repository lockfile.
- Required analysis: `mise exec -- pnpm run knip`, which runs Knip with only
  `exports` and `types` staged out. It passes with no unused files, ordinary
  unused dependencies, unlisted imports/binaries, unresolved imports, or
  unhandled duplicate-export findings.
- Advisory analysis: `mise exec -- pnpm run knip:exports` reports 69 unused
  value exports and 45 unused exported types, but exits successfully. The
  normal `check` path runs both analyses, so findings remain visible without
  turning this configuration pass into speculative API cleanup.
- Production comparison: `mise exec -- pnpm exec knip --production` reports 49
  unused files, 3 unlisted binaries, 95 unused value exports, and 58 unused
  exported types. This mode excludes test/dev-only consumers, so its additional
  findings are not removal candidates; notably, the binary findings are
  `cross-env`, `changeset`, and `wrangler` referenced by Nx targets in
  `project.json` and declared as root devDependencies.

The package manifests and [`repository/topology.json`](../repository/topology.json)
define the supported surfaces. Knip's entry/export analysis retains those
surfaces: the fixture test proves that a package-entry export remains reachable
while a genuinely unused internal export and file are reported. It also keeps
the package-script command/helper, host-loaded extension, and dynamically
imported integration reachable.

## Classification

The 114 normal-mode findings are candidate removals of exported visibility,
not proven-dead implementations. Knip's full-mode import/re-export graph
includes the repository tests and declared package entrypoints; the reviewed
symbols below have no importing or re-exporting caller in that graph. The
package maps expose entry files or explicit subpaths, not these implementation
modules. Targeted checks confirmed that `app` in `packages/cli/src/routes.ts`
is used locally by `runRoutes` (so only its export modifier is a candidate),
and that `ErrorType` from `packages/core/src/utils/error-policy.ts` is a live
entry export while the separately named `ErrorType` re-export from
`error-handler.ts` has no callers.

| Candidate group                                                                                | Callers and external surface checked                                                                                                                                                                                             | Confidence and external risk                                                                                                                            | Proposed action                                                                                                                                  | Required verification before any follow-up edit                                                |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `packages/cli/src/routes.ts`, `packages/cli/src/output/contracts.ts`                           | Normal-mode graph includes CLI source/tests; `app` is consumed inside `runRoutes`. The public CLI manifest exposes a binary, not these module paths.                                                                             | High confidence that listed export visibility is unused; low package API risk.                                                                          | Consider removing only `export`; retain route behavior and output contracts pending a separate cleanup issue.                                    | `test:cli`, `test:pack:cli`, and CLI output contract tests.                                    |
| `packages/core/src/**`                                                                         | Normal-mode graph includes downstream workspace imports and tests. Compared with `packages/core`'s `.` and `./mutations` export map; listed declarations are not re-exported. Knip trace checked the `ErrorType` name collision. | High confidence for visibility-only candidates; low package API risk because Core is private and these declarations are outside its mapped entrypoints. | Consider de-exporting only; preserve all runtime implementations and response contracts.                                                         | Core unit/contract tests, `check:boundaries`, and Node/Worker/CLI package smoke tests.         |
| `packages/hevy-client/src/**`                                                                  | Normal-mode graph includes client consumers/tests. Compared with `.`, `./types`, `./schemas`, and `./internal` maps; listed declarations are not part of those curated entry files.                                              | High confidence for visibility-only candidates; low risk through supported package exports.                                                             | Keep curated client exports; consider de-exporting only internal declarations. Do not alter generated output.                                    | Client type checks, generated-output checks, and affected package smoke tests.                 |
| `packages/node/src/utils/**`, `packages/worker/src/**`, `packages/operations/src/workflows.ts` | Normal-mode graph includes adapter and operations consumers/tests. Compared with each workspace's declared package entrypoint; listed declarations are not re-exported there.                                                    | High confidence for visibility-only candidates; low risk through supported package exports.                                                             | Do not remove lifecycle, OAuth, telemetry, or workflow behavior in this pass; visibility-only cleanup can be reviewed separately.                | Stdio, Worker, Worker HTTP, operations tests, and package/bundle checks for affected adapters. |
| `scripts/**`, `tests/**`, `tools/oxlint/anti-slop/**`                                          | Normal-mode graph includes package scripts, CI/config roots, test files, and the custom lint plugin. Listed symbols have no import/re-export caller; production-mode-only file and binary reports are tracked separately above.  | High confidence for unused export visibility; implementation-removal confidence varies by script, fixture, and lint ownership.                          | De-export only where a later focused review confirms the local call path; do not delete scripts, fixtures, or lint rules from this report alone. | `check:control-plane`, package/check scripts, test lanes, and `pnpm run check` as appropriate. |

No implementation or package dependency deletion is classified as safe from
this analysis alone. Reflection, source-checkout consumers, and undocumented
conventions need separate confirmation. The existing table records every
symbol-level visibility candidate; no symbol or implementation was removed in
this configuration pass.

## Configuration semantics reviewed

The [Knip v6 configuration reference](https://knip.dev/reference/configuration),
[entry-file guidance](https://knip.dev/explanations/entry-files), and
[issue-type reference](https://knip.dev/reference/issue-types) were checked
against the installed Knip 6.35.1 CLI and lockfile. In particular, `entry`
defines graph roots; `ignoreFiles` suppresses only unused-file findings;
`ignoreIssues` is limited to named issue types and paths; and `ignore` would
suppress every issue type for matching files. The generated-client exclusion
remains the only broad all-issue file exclusion. The script declaration
exceptions are now explicit paths rather than a `scripts/**/*.d.mts` glob.

| Source module                                          | Unused value exports                                                                                                                                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/routes.ts`                           | `app`                                                                                                                                                                                                      |
| `packages/core/src/tools/input-schemas.ts`             | `RPE_VALUES`, `workoutExerciseFields`, `workoutExercisesSchema`, `replaceWorkoutPayloadFields`, `replaceWorkoutInputFields`, `workoutMetadataPatchSchema`, `routineExerciseFields`, `routinePayloadFields` |
| `packages/core/src/tools/tool-runtime.ts`              | `defaultHandlerFactory`                                                                                                                                                                                    |
| `packages/core/src/utils/error-handler.ts`             | `ErrorType`                                                                                                                                                                                                |
| `packages/core/src/utils/error-policy.ts`              | `isRetryExhausted`, `getRetryAfterSeconds`, `getStatusErrorMessage`                                                                                                                                        |
| `packages/core/src/utils/exercise-template-catalog.ts` | `EXERCISE_TEMPLATE_CATALOG_CACHE_KEY`                                                                                                                                                                      |
| `packages/core/src/utils/output-schemas.ts`            | `formattedWorkoutSetSchema`, `formattedWorkoutExerciseSchema`, `formattedRoutineSetSchema`, `formattedRoutineExerciseSchema`                                                                               |
| `packages/core/src/utils/response-contracts.ts`        | `workoutCountResponse`                                                                                                                                                                                     |
| `packages/core/src/utils/result-telemetry.ts`          | `RESULT_COUNT_BUCKETS`                                                                                                                                                                                     |
| `packages/core/src/utils/tool-annotations.ts`          | `destructiveAnnotations`                                                                                                                                                                                   |
| `packages/core/src/utils/tool-helpers.ts`              | `createTypedToolHandler`                                                                                                                                                                                   |
| `packages/core/src/utils/tool-taxonomy.ts`             | `HEVY_TOOL_FEATURES`, `MCP_TOOL_KINDS`, `MCP_TOOL_OPERATIONS`                                                                                                                                              |
| `packages/hevy-client/src/hevy-client-kubb.ts`         | `RETRY_BACKOFF_BASE_MS`                                                                                                                                                                                    |
| `packages/hevy-client/src/retry-policy.ts`             | `RETRY_BACKOFF_MAX_MS`, `RETRY_BACKOFF_BASE_MS`, `parseRetryAfterMs`                                                                                                                                       |
| `packages/node/src/utils/graceful-shutdown.ts`         | `FORCED_EXIT_TIMEOUT_MS`, `flushStdout`                                                                                                                                                                    |
| `packages/node/src/utils/mcp-session-observability.ts` | `MCP_SESSION_TERMINATION_CATEGORIES`, `extractMcpClientMetadata`                                                                                                                                           |
| `packages/node/src/utils/metrics.ts`                   | `expectedHevy404s`                                                                                                                                                                                         |
| `packages/node/src/utils/node-lifecycle.ts`            | `INVALID_API_KEY_MESSAGE`                                                                                                                                                                                  |
| `packages/node/src/utils/streamable-http.ts`           | `isHttpHostAllowed`                                                                                                                                                                                        |
| `packages/worker/src/worker-oauth.ts`                  | `OAUTH_ACCESS_TOKEN_TTL_SECONDS`, `OAUTH_REFRESH_TOKEN_TTL_SECONDS`, `validateAuthRequest`                                                                                                                 |
| `scripts/control-plane-models.mjs`                     | `controlPlaneRoot`, `loadValidationLanes`, `loadProject`, `relativePath`                                                                                                                                   |
| `scripts/control-plane-validation.mjs`                 | `validateTopology`, `validateArtifactProvenance`, `validateAggregateAcyclicity`, `flattenAggregateLanes`, `validateValidationLanes`                                                                        |
| `scripts/repository-control-plane.mjs`                 | `controlPlaneRoot`, `loadControlPlane`, `loadProject`, `loadValidationLanes`, `relativePath`, `validateAggregateAcyclicity`, `validateArtifactProvenance`, `validateTopology`, `validateValidationLanes`   |
| `scripts/workflow-projections.mjs`                     | `mappedLaneTargets`, `parseWorkflowLaneExecutions`                                                                                                                                                         |
| `tests/contract/fixtures.ts`                           | `deterministicWorkout`, `deterministicGetWorkoutsResult`                                                                                                                                                   |
| `tests/nightly/diagnostics.mjs`                        | `RESULT_CATEGORIES`, `ERROR_CLASSES`                                                                                                                                                                       |
| `tests/performance/fixture-result.ts`                  | `fixtureModeSchema`                                                                                                                                                                                        |
| `tests/performance/harness.ts`                         | `PERFORMANCE_API_KEY`                                                                                                                                                                                      |
| `tests/performance/report.ts`                          | `PERFORMANCE_REPORT_VERSION`, `performanceScenarioSchema`                                                                                                                                                  |
| `tools/oxlint/anti-slop/shared/dictionary-types.ts`    | `isPopulatedObjectExpression`                                                                                                                                                                              |

| Source module                                          | Unused exported types                                                                                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/output/contracts.ts`                 | `PaginationEnvelope`, `SearchResult`, `SummaryResult`                                                                               |
| `packages/core/src/observation.ts`                     | `SafeToolPresenceArgumentKey`, `SafeToolNumericArgumentKey`, `SafeToolBooleanArgumentKey`                                           |
| `packages/core/src/tools/input-schemas.ts`             | `RpeStringValue`, `WorkoutSetInput`, `WorkoutExerciseInput`, `RoutineSetInput`, `RoutineExerciseInput`, `RoutineUpdatePayloadInput` |
| `packages/core/src/tools/tool-runtime.ts`              | `ToolRuntimeServiceContext`                                                                                                         |
| `packages/core/src/utils/error-handler.ts`             | `StructuredExecutionError`, `ErrorResponse`, `EnhancedErrorResponse`, `ErrorDebugContext`                                           |
| `packages/core/src/utils/error-policy.ts`              | `SafeStackFrame`                                                                                                                    |
| `packages/core/src/utils/exercise-template-catalog.ts` | `ExerciseTemplateCatalogRefreshReason`, `ExerciseTemplateCatalogOptions`                                                            |
| `packages/core/src/utils/hevy-error-policy.ts`         | `HevyReadOperation`, `Expected404Outcome`                                                                                           |
| `packages/core/src/utils/mcp-client-logger.ts`         | `McpClientLogMessage`                                                                                                               |
| `packages/core/src/utils/output-schemas.ts`            | `FormattedExerciseTemplate`                                                                                                         |
| `packages/core/src/utils/pagination.ts`                | `PageResult`                                                                                                                        |
| `packages/core/src/utils/response-contracts.ts`        | `WorkflowTelemetry`                                                                                                                 |
| `packages/core/src/utils/result-telemetry.ts`          | `WorkflowResultTelemetry`                                                                                                           |
| `packages/core/src/utils/tool-taxonomy.ts`             | `McpToolKind`                                                                                                                       |
| `packages/hevy-client/src/fetch.ts`                    | `ResponseErrorConfig`, `Client`                                                                                                     |
| `packages/hevy-client/src/hevy-client.ts`              | `HevyOperationSafety`                                                                                                               |
| `packages/node/src/utils/node-lifecycle.ts`            | `NodeLifecycleTransport`, `NodeLifecycleContext`, `NodeLifecycleTarget`, `NodeLifecycleOutcome`, `NodeLifecycleStartupResult`       |
| `packages/node/src/utils/result-telemetry.ts`          | `ResultCountBucket`, `ToolResultTelemetry`, `ToolResultSummary`                                                                     |
| `packages/node/src/utils/startup-errors.ts`            | `StartupErrorLogger`                                                                                                                |
| `packages/node/src/utils/streamable-http.ts`           | `OwnedMcpServer`                                                                                                                    |
| `packages/worker/src/worker-oauth.ts`                  | `HevyGrantProps`                                                                                                                    |
| `packages/worker/src/worker-observer.ts`               | `WorkerObservationSink`, `WorkerTracing`                                                                                            |
| `tools/oxlint/anti-slop/shared/dictionary-types.ts`    | `WideningTargetKind`                                                                                                                |

## Retained exceptions

Each exception below has a current consumer, a named owner, and a check to run
when that consumer or its configuration changes.

| Exception and config path                                                                                                                              | Why it remains                                                                                                                                                                                                                                                                                                                          | Owner                                                            | Continued-use check                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mise` — root `ignoreBinaries` in `knip.json`                                                                                                          | Toolchain manager is installed outside npm and pinned in `mise.toml`; setup and CI continue to invoke it.                                                                                                                                                                                                                               | Repository toolchain maintainers                                 | Review `mise.toml`, `CONTRIBUTING.md`, and the mise setup steps in `.github/workflows/`; `mise exec -- pnpm run check`.                                                                                |
| `cloudflare` — root and `packages/worker` `ignoreDependencies`                                                                                         | `cloudflare:workers` and `cloudflare:test` are runtime-provided virtual modules, not installable npm packages.                                                                                                                                                                                                                          | Worker and test-harness maintainers                              | `mise exec -- pnpm run test:worker`, `mise exec -- pnpm run test:worker-http`, and `mise exec -- pnpm run check`.                                                                                      |
| `@earendil-works/pi-coding-agent` — root `ignoreDependencies`                                                                                          | Supplies the host `ExtensionAPI` type imported by `.pi/extensions/entire/index.ts`; Pi loads the extension externally.                                                                                                                                                                                                                  | Entire/Pi extension maintainers                                  | `mise exec -- pnpm run check:types`; re-check the host integration if the extension or its type import moves.                                                                                          |
| `duplicates` — `packages/hevy-client/src/fetch.ts`, `packages/hevy-client/src/internal-request-effect.ts`, `packages/operations/src/workflows.ts`      | These files intentionally retain compatibility aliases; no other file is exempted.                                                                                                                                                                                                                                                      | Hevy-client and Operations maintainers                           | `mise exec -- pnpm run check` keeps duplicate-export diagnostics enabled outside these paths.                                                                                                          |
| Generated output — `packages/hevy-client/src/generated/**` in `knip.json`                                                                              | Kubb-generated API files are governed by their source spec and generator, not manual dead-code cleanup.                                                                                                                                                                                                                                 | Hevy-client maintainers                                          | `mise exec -- pnpm run check:openapi` and `mise exec -- pnpm run check:generated`.                                                                                                                     |
| Test assets — `tests/fixtures/**` in `knip.json` `ignoreFiles`                                                                                         | Knip does not infer all file-copy and fixture-directory consumers. This affects unused-file reporting only. Current consumers are `scripts/codegen/check-generated-client.test.ts`, `tests/unit/knip-analysis.test.ts`, `tests/unit/package-boundaries.test.ts`, and `packages/node/src/utils/graceful-shutdown.child-process.test.ts`. | Owners of those tests: Hevy-client, repository quality, and Node | `mise exec -- pnpm run test:unit`, plus `mise exec -- pnpm run check:generated`, `mise exec -- pnpm run check:boundaries`, and `mise exec -- pnpm run test:stdio` for their respective fixture groups. |
| Script declaration sidecars — eight root-level `scripts/*.d.mts` paths and `scripts/codegen/check-generated-client.d.mts` in `knip.json` `ignoreFiles` | Each declaration accompanies a same-name `.mjs` script for TypeScript callers; these are not runtime entry files.                                                                                                                                                                                                                       | Maintainers of the paired scripts                                | `mise exec -- pnpm run check:types`; when adding or removing a sidecar, update the explicit list and verify its `.mjs` consumer.                                                                       |

The fixture and declaration exceptions remain deliberately visible in the
configuration rather than being widened to a whole-tree `ignore`. Revisit each
row when its listed consumer, owner, or validation lane changes.
