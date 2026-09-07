# @hevy-mcp/operations

## 0.1.8

### Patch Changes

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Expose the complete native Effect request client through the internal seam while preserving the public Promise client.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add an Effect-first training summary workflow with deterministic UTC scans.

- [#1120](https://github.com/chrisdoc/hevy-mcp/pull/1120) [`82ca0c9`](https://github.com/chrisdoc/hevy-mcp/commit/82ca0c95d033e593588f894b555bee7ada6cdb68) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Route CLI domain commands through the shared Effect-first Hevy operations and
  preserve summary and search behavior across the operations boundary.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Move shared mutation payload builders and Hevy mutation quirks into operations.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Document the Effect-first operations layer while keeping the public Node and CLI adapters Promise-shaped.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Use Effect scheduling as the typed retry timing seam for the Hevy client.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Keep exercise-template catalog lookups in a server-scoped Effect cache.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Optimize test suite execution by using fake timers for retry backoff delays.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Isolate Effect retry schedule state so concurrent and sequential requests keep independent retry indexes.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Expose the Hevy request Effect through a curated internal client subpath while
  keeping the public client Promise-only.

- [#1141](https://github.com/chrisdoc/hevy-mcp/pull/1141) [`cebd280`](https://github.com/chrisdoc/hevy-mcp/commit/cebd280fafda0e11b51354c34d96c662e51c2c57) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Deduplicate operation construction: one operation factory with derived tracing spans, unconditional options passthrough, and shared read-outcome, page-echo, and pagination helpers.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Move typed Effect HTTP errors to the client package and centralize pure read-error classification.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add Effect-first workout writes, events, and count operations.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add Effect-first body measurement read and write operations.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Compose read operations directly from the internal request Effect while
  preserving their public Promise API.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Let Effect schedules own Hevy client retry backoff waits.

- [#1138](https://github.com/chrisdoc/hevy-mcp/pull/1138) [`a40d322`](https://github.com/chrisdoc/hevy-mcp/commit/a40d3222c5c579b8b6c80b3c848f843ec9ce45c7) Thanks [@chrisdoc](https://github.com/chrisdoc)! - perf(core, hevy-client): replace Zod safeParse runtime predicates with Effect Predicate module. Replaced custom Zod schemas and safeParse calls in `packages/core/src/utils/type-predicates.ts` and `packages/hevy-client/src/hevy-client-kubb.ts` with Effect's native `Predicate` module (`isString`, `isNumber`, `isBoolean`, `isObject`, `isFunction`), eliminating repeated parsing allocations in the hot request path.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Preserve sanitized request identity (method and canonical endpoint) on tagged
  NetworkError diagnostics for statusless fetch failures.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Share the internal AbortSignal-to-fiber interruption bridge between the
  runtime-neutral client and Worker validation cache.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Normalize paginated operations, recover only endpoint-scoped expected 404s, and report page mismatches as tagged errors.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Complete the request-local Effect retry interpreter while preserving client and adapter behavior.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add Effect-first routine creation, updates, and paginated title search.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Map internal Effect client HTTP and transport failures to discriminable tagged errors while preserving the public Promise client error behavior.

- [#1140](https://github.com/chrisdoc/hevy-mcp/pull/1140) [`18d2949`](https://github.com/chrisdoc/hevy-mcp/commit/18d2949a36d26c0716369b24309d1970fb7bcc9d) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Harden Effect type safety: narrow the request error channel to tagged errors, surface bounded-execution timeouts as typed deadline failures, validate template search pagination, and return template list results as an explicit struct.

- [#1145](https://github.com/chrisdoc/hevy-mcp/pull/1145) [`1080685`](https://github.com/chrisdoc/hevy-mcp/commit/10806857abab7ddcb2d8dd5611a8bcd627d233ce) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Governance pass: rebalance hooks (cached unit lane on pre-commit, full check on pre-push), enforce knip, drop the dead client primitives barrel, and document boundaries and PR expectations.

- [#1151](https://github.com/chrisdoc/hevy-mcp/pull/1151) [`131da8e`](https://github.com/chrisdoc/hevy-mcp/commit/131da8eeb0041b54eb00a479493772f280af73a0) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Restore the fresh-budget deadline retry for timed-out reads. The Effect runtime
  migration dropped the extended operation deadline, so a read whose first attempt
  overshot its timeout could starve the retry before dispatch and skip the second
  fetch.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add Effect-first template, folder, and user operations with paginated catalogs.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Upgrade workspace dependencies and regenerate client with Kubb.

- [#1142](https://github.com/chrisdoc/hevy-mcp/pull/1142) [`7969bd8`](https://github.com/chrisdoc/hevy-mcp/commit/7969bd8e7095c0ec3bd12b6170dd5310594ce9a3) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Simplify Effect runtime usage: one abort-signal bridge, compiler-checked error vocabulary, a single cause-normalization boundary, lazy service layers, Effect-native catalog lifecycle, and shared response pagination.
- Updated dependencies [[`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`a40d322`](https://github.com/chrisdoc/hevy-mcp/commit/a40d3222c5c579b8b6c80b3c848f843ec9ce45c7), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`18d2949`](https://github.com/chrisdoc/hevy-mcp/commit/18d2949a36d26c0716369b24309d1970fb7bcc9d), [`1080685`](https://github.com/chrisdoc/hevy-mcp/commit/10806857abab7ddcb2d8dd5611a8bcd627d233ce), [`131da8e`](https://github.com/chrisdoc/hevy-mcp/commit/131da8eeb0041b54eb00a479493772f280af73a0), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`7969bd8`](https://github.com/chrisdoc/hevy-mcp/commit/7969bd8e7095c0ec3bd12b6170dd5310594ce9a3)]:
  - @hevy-mcp/hevy-client@0.2.7

## 0.1.7

### Patch Changes

- [#1097](https://github.com/chrisdoc/hevy-mcp/pull/1097) [`05ee904`](https://github.com/chrisdoc/hevy-mcp/commit/05ee904e547221b64baacad93c29a19f3fb0e7d1) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Extract the Hevy retry policy behind a pure, independently testable seam.

- [#1097](https://github.com/chrisdoc/hevy-mcp/pull/1097) [`05ee904`](https://github.com/chrisdoc/hevy-mcp/commit/05ee904e547221b64baacad93c29a19f3fb0e7d1) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add an Effect execution boundary that guarantees cancellation-resource cleanup.

- [#1097](https://github.com/chrisdoc/hevy-mcp/pull/1097) [`05ee904`](https://github.com/chrisdoc/hevy-mcp/commit/05ee904e547221b64baacad93c29a19f3fb0e7d1) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add the initial Effect dependency and typed foundation services for incremental adoption.

- [#1097](https://github.com/chrisdoc/hevy-mcp/pull/1097) [`05ee904`](https://github.com/chrisdoc/hevy-mcp/commit/05ee904e547221b64baacad93c29a19f3fb0e7d1) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Upgrade Kubb code generation toolchain to v5.
- Updated dependencies [[`05ee904`](https://github.com/chrisdoc/hevy-mcp/commit/05ee904e547221b64baacad93c29a19f3fb0e7d1), [`05ee904`](https://github.com/chrisdoc/hevy-mcp/commit/05ee904e547221b64baacad93c29a19f3fb0e7d1), [`05ee904`](https://github.com/chrisdoc/hevy-mcp/commit/05ee904e547221b64baacad93c29a19f3fb0e7d1), [`05ee904`](https://github.com/chrisdoc/hevy-mcp/commit/05ee904e547221b64baacad93c29a19f3fb0e7d1)]:
  - @hevy-mcp/hevy-client@0.2.6

## 0.1.6

### Patch Changes

- [#1094](https://github.com/chrisdoc/hevy-mcp/pull/1094) [`16d359a`](https://github.com/chrisdoc/hevy-mcp/commit/16d359a26a9435391915a3f31dd20a63f4d7e4c0) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Combine five retry-resilience and error-clarity fixes into one release:
  
  - Retry read operations once with a fresh timeout budget after a deadline,
    bounded by an overall operation deadline. Per-operation timeoutMs overrides
    are now supported. An explicit caller deadline remains authoritative —
    no deadline retry extends beyond it.
  - Give each retry attempt its own fresh per-attempt timeout window and add
    bounded crypto-random jitter to all retry backoff, reducing synchronized
    HTTP 429 retries.
  - Report caller-initiated request cancellation as a client cancellation
    instead of an ambiguous Hevy API cancellation.
  - Reject invalid empty routine exercise and set lists before API calls, and
    include sanitized Hevy validation details when routine mutations receive
    HTTP 400 responses.
  - Provide actionable guidance when creating a body measurement conflicts with
    an existing date.
- Updated dependencies [[`16d359a`](https://github.com/chrisdoc/hevy-mcp/commit/16d359a26a9435391915a3f31dd20a63f4d7e4c0)]:
  - @hevy-mcp/hevy-client@0.2.5

## 0.1.5

### Patch Changes

- [#1083](https://github.com/chrisdoc/hevy-mcp/pull/1083) [`a9cca6b`](https://github.com/chrisdoc/hevy-mcp/commit/a9cca6bc167c7a296532d10d1a272851b43487a4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - chore: switch the repository package manager from npm to pnpm 12. Internal workspace dependencies use the `workspace:*` protocol, scripts/workflows/docs were migrated, and the lockfile is now `pnpm-lock.yaml`. No runtime behavior change.

## 0.1.4

### Patch Changes

- [#1056](https://github.com/chrisdoc/hevy-mcp/pull/1056) [`3a29218`](https://github.com/chrisdoc/hevy-mcp/commit/3a29218d6b1d837eeecb5cb849396eee9f62e3e0) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Narrow the operations interface to the names consumers actually use; remove four dead exported predicates and stop re-exporting internal operation plumbing.

- [#1057](https://github.com/chrisdoc/hevy-mcp/pull/1057) [`139ae78`](https://github.com/chrisdoc/hevy-mcp/commit/139ae78a3293ebe401a13ea88f3946f29848577e) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Export the generated workout and routine set schemas from the curated schemas entry point and pin the MCP input enum vocabularies (RPE, set type) to them with a contract test, so upstream enum changes surface at test time instead of drifting.
- Updated dependencies [[`139ae78`](https://github.com/chrisdoc/hevy-mcp/commit/139ae78a3293ebe401a13ea88f3946f29848577e)]:
  - @hevy-mcp/hevy-client@0.2.4

## 0.1.3

### Patch Changes

- [#1033](https://github.com/chrisdoc/hevy-mcp/pull/1033) [`331a3bc`](https://github.com/chrisdoc/hevy-mcp/commit/331a3bc77d462161fc2922a5ece22d39a6d0c839) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Increase the default Hevy API operation deadline to accommodate slow, large collection responses.

- [#1033](https://github.com/chrisdoc/hevy-mcp/pull/1033) [`331a3bc`](https://github.com/chrisdoc/hevy-mcp/commit/331a3bc77d462161fc2922a5ece22d39a6d0c839) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Return a structured, confirmed acknowledgement from `create-routine`, including the authoritative routine when Hevy provides one.
- Updated dependencies [[`331a3bc`](https://github.com/chrisdoc/hevy-mcp/commit/331a3bc77d462161fc2922a5ece22d39a6d0c839), [`331a3bc`](https://github.com/chrisdoc/hevy-mcp/commit/331a3bc77d462161fc2922a5ece22d39a6d0c839)]:
  - @hevy-mcp/hevy-client@0.2.3

## 0.1.2

### Patch Changes

- [#1015](https://github.com/chrisdoc/hevy-mcp/pull/1015) [`0e4d8a3`](https://github.com/chrisdoc/hevy-mcp/commit/0e4d8a33a54f07670aeb8a53d575981010a0f7e7) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add the anti-slop Oxlint plugin and migrate omission-preserving response projection helpers to a shared typed helper.
- Updated dependencies [[`0e4d8a3`](https://github.com/chrisdoc/hevy-mcp/commit/0e4d8a33a54f07670aeb8a53d575981010a0f7e7)]:
  - @hevy-mcp/hevy-client@0.2.2

## 0.1.1

### Patch Changes

- [#968](https://github.com/chrisdoc/hevy-mcp/pull/968) [`23afac3`](https://github.com/chrisdoc/hevy-mcp/commit/23afac3c4ab0d66b60cb193d9efc86b598b1d6da) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Use Oxfmt for generated client formatting and remove the repository's Prettier dependency.

- [#968](https://github.com/chrisdoc/hevy-mcp/pull/968) [`23afac3`](https://github.com/chrisdoc/hevy-mcp/commit/23afac3c4ab0d66b60cb193d9efc86b598b1d6da) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Capture bounded, allowlisted, redacted upstream error details in API diagnostics without adding response text to metrics.
- Updated dependencies [[`23afac3`](https://github.com/chrisdoc/hevy-mcp/commit/23afac3c4ab0d66b60cb193d9efc86b598b1d6da), [`23afac3`](https://github.com/chrisdoc/hevy-mcp/commit/23afac3c4ab0d66b60cb193d9efc86b598b1d6da)]:
  - @hevy-mcp/hevy-client@0.2.1

## 0.1.0

### Minor Changes

- [#944](https://github.com/chrisdoc/hevy-mcp/pull/944) [`1ae0e10`](https://github.com/chrisdoc/hevy-mcp/commit/1ae0e1017646a1fe843a35c984537995e2521f7e) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Centralize typed Hevy endpoint identity and transient error policy across client, operations, Core, and Node observability.

### Patch Changes

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add a typed routines get operation and use it from Core while preserving the CLI get path.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add a typed routines list operation and use it from Core and the CLI.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Enforce type-aware async function usage with Oxlint.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add a typed workouts get operation and use it from Core while preserving the CLI get path.
- Updated dependencies [[`1ae0e10`](https://github.com/chrisdoc/hevy-mcp/commit/1ae0e1017646a1fe843a35c984537995e2521f7e), [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4)]:
  - @hevy-mcp/hevy-client@0.2.0

## 0.0.3

### Patch Changes

- [#907](https://github.com/chrisdoc/hevy-mcp/pull/907) [`4dec481`](https://github.com/chrisdoc/hevy-mcp/commit/4dec481875cb97041ab558177f94c859fe48ee3f) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Update Kubb and related development dependencies, and refresh the generated Hevy API client.
- Updated dependencies [[`4dec481`](https://github.com/chrisdoc/hevy-mcp/commit/4dec481875cb97041ab558177f94c859fe48ee3f)]:
  - @hevy-mcp/hevy-client@0.1.1

## 0.0.2

### Patch Changes

- [#902](https://github.com/chrisdoc/hevy-mcp/pull/902) [`cafe0c6`](https://github.com/chrisdoc/hevy-mcp/commit/cafe0c624de9804c11a93b20f2364c4e742c6cc3) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Share the typed workouts.list operation between the MCP server and CLI.

- Updated dependencies [[`5f78f33`](https://github.com/chrisdoc/hevy-mcp/commit/5f78f334c01016580fcff8af895d50997ef9ae87), [`976f570`](https://github.com/chrisdoc/hevy-mcp/commit/976f570fe1a0258ee5442002c830385dc888ad72)]:
  - @hevy-mcp/hevy-client@0.1.0
