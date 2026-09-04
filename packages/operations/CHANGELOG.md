# @hevy-mcp/operations

## 0.1.8

### Patch Changes

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Use Effect scheduling as the typed retry timing seam for the Hevy client.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Isolate Effect retry schedule state so concurrent and sequential requests keep independent retry indexes.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Expose the Hevy request Effect through a curated internal client subpath while
  keeping the public client Promise-only.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Move typed Effect HTTP errors to the client package and centralize pure read-error classification.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Compose read operations directly from the internal request Effect while
  preserving their public Promise API.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Complete the request-local Effect retry interpreter while preserving client and adapter behavior.

- [#1104](https://github.com/chrisdoc/hevy-mcp/pull/1104) [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Upgrade workspace dependencies and regenerate client with Kubb.
- Updated dependencies [[`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219), [`99f2e43`](https://github.com/chrisdoc/hevy-mcp/commit/99f2e43476a0f7699460136da2d45780d83e5219)]:
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
