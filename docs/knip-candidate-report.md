# Knip removal-candidate report

This report captures the first full analysis after narrowing Knip roots for
issue #1172. It is evidence for follow-up review, not authorization to delete
code or change package contracts.

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

- `mise` is an externally installed toolchain manager, not an npm dependency.
- `cloudflare` is Cloudflare's virtual `cloudflare:workers` / `cloudflare:test`
  runtime module, scoped to the Worker and root test workspaces.
- `@earendil-works/pi-coding-agent` provides the Pi host's `ExtensionAPI` type
  to `.pi/extensions/entire/index.ts`; Pi loads that extension externally.
- The `duplicates` issue is suppressed only in three files containing deliberate
  compatibility aliases: `packages/hevy-client/src/fetch.ts`,
  `packages/hevy-client/src/internal-request-effect.ts`, and
  `packages/operations/src/workflows.ts`. Other duplicate exports remain errors.
- Generated Hevy-client files are excluded from analysis. Test fixtures and
  authored `.d.mts` script companions are excluded only from the unused-file
  report; other issue types remain analyzable.
