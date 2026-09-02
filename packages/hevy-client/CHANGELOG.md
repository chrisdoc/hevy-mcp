# @hevy-mcp/hevy-client

## 0.2.6

### Patch Changes

- [#1097](https://github.com/chrisdoc/hevy-mcp/pull/1097) [`05ee904`](https://github.com/chrisdoc/hevy-mcp/commit/05ee904e547221b64baacad93c29a19f3fb0e7d1) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Extract the Hevy retry policy behind a pure, independently testable seam.

- [#1097](https://github.com/chrisdoc/hevy-mcp/pull/1097) [`05ee904`](https://github.com/chrisdoc/hevy-mcp/commit/05ee904e547221b64baacad93c29a19f3fb0e7d1) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add an Effect execution boundary that guarantees cancellation-resource cleanup.

- [#1097](https://github.com/chrisdoc/hevy-mcp/pull/1097) [`05ee904`](https://github.com/chrisdoc/hevy-mcp/commit/05ee904e547221b64baacad93c29a19f3fb0e7d1) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add the initial Effect dependency and typed foundation services for incremental adoption.

- [#1097](https://github.com/chrisdoc/hevy-mcp/pull/1097) [`05ee904`](https://github.com/chrisdoc/hevy-mcp/commit/05ee904e547221b64baacad93c29a19f3fb0e7d1) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Upgrade Kubb code generation toolchain to v5.

## 0.2.5

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

## 0.2.4

### Patch Changes

- [#1057](https://github.com/chrisdoc/hevy-mcp/pull/1057) [`139ae78`](https://github.com/chrisdoc/hevy-mcp/commit/139ae78a3293ebe401a13ea88f3946f29848577e) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Export the generated workout and routine set schemas from the curated schemas entry point and pin the MCP input enum vocabularies (RPE, set type) to them with a contract test, so upstream enum changes surface at test time instead of drifting.

## 0.2.3

### Patch Changes

- [#1033](https://github.com/chrisdoc/hevy-mcp/pull/1033) [`331a3bc`](https://github.com/chrisdoc/hevy-mcp/commit/331a3bc77d462161fc2922a5ece22d39a6d0c839) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Increase the default Hevy API operation deadline to accommodate slow, large collection responses.

- [#1033](https://github.com/chrisdoc/hevy-mcp/pull/1033) [`331a3bc`](https://github.com/chrisdoc/hevy-mcp/commit/331a3bc77d462161fc2922a5ece22d39a6d0c839) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Return a structured, confirmed acknowledgement from `create-routine`, including the authoritative routine when Hevy provides one.

## 0.2.2

### Patch Changes

- [#1015](https://github.com/chrisdoc/hevy-mcp/pull/1015) [`0e4d8a3`](https://github.com/chrisdoc/hevy-mcp/commit/0e4d8a33a54f07670aeb8a53d575981010a0f7e7) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add the anti-slop Oxlint plugin and migrate omission-preserving response projection helpers to a shared typed helper.

## 0.2.1

### Patch Changes

- [#968](https://github.com/chrisdoc/hevy-mcp/pull/968) [`23afac3`](https://github.com/chrisdoc/hevy-mcp/commit/23afac3c4ab0d66b60cb193d9efc86b598b1d6da) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Use Oxfmt for generated client formatting and remove the repository's Prettier dependency.

- [#968](https://github.com/chrisdoc/hevy-mcp/pull/968) [`23afac3`](https://github.com/chrisdoc/hevy-mcp/commit/23afac3c4ab0d66b60cb193d9efc86b598b1d6da) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Capture bounded, allowlisted, redacted upstream error details in API diagnostics without adding response text to metrics.

## 0.2.0

### Minor Changes

- [#944](https://github.com/chrisdoc/hevy-mcp/pull/944) [`1ae0e10`](https://github.com/chrisdoc/hevy-mcp/commit/1ae0e1017646a1fe843a35c984537995e2521f7e) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Centralize typed Hevy endpoint identity and transient error policy across client, operations, Core, and Node observability.

### Patch Changes

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Enforce type-aware async function usage with Oxlint.

## 0.1.1

### Patch Changes

- [#907](https://github.com/chrisdoc/hevy-mcp/pull/907) [`4dec481`](https://github.com/chrisdoc/hevy-mcp/commit/4dec481875cb97041ab558177f94c859fe48ee3f) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Update Kubb and related development dependencies, and refresh the generated Hevy API client.

## 0.1.0

### Minor Changes

- [#887](https://github.com/chrisdoc/hevy-mcp/pull/887) [`976f570`](https://github.com/chrisdoc/hevy-mcp/commit/976f570fe1a0258ee5442002c830385dc888ad72) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add invocation-scoped cancellation, absolute deadlines, commit-state outcomes, and safe retry diagnostics across the Hevy client, MCP adapters, Worker, Node server, and CLI.

### Patch Changes

- [#890](https://github.com/chrisdoc/hevy-mcp/pull/890) [`5f78f33`](https://github.com/chrisdoc/hevy-mcp/commit/5f78f334c01016580fcff8af895d50997ef9ae87) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Keep generated client output complete and reproducible while centralizing
  repository topology, artifact provenance, and validation lanes.

## 0.0.3

### Patch Changes

- [#848](https://github.com/chrisdoc/hevy-mcp/pull/848) [`11d55d2`](https://github.com/chrisdoc/hevy-mcp/commit/11d55d238cfc4e874d470d798206c349fda4d9d0) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add privacy-safe MCP session correlation and richer request lifecycle telemetry.

- [#848](https://github.com/chrisdoc/hevy-mcp/pull/848) [`11d55d2`](https://github.com/chrisdoc/hevy-mcp/commit/11d55d238cfc4e874d470d798206c349fda4d9d0) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add bounded, privacy-safe failure events and expected outcome classification.

## 0.0.2

### Patch Changes

- [#833](https://github.com/chrisdoc/hevy-mcp/pull/833) [`39d5896`](https://github.com/chrisdoc/hevy-mcp/commit/39d589617b1a83ae36a97ce6b52aa89f022681e5) Thanks [@neontty](https://github.com/neontty)! - Fix get-routine failing for every routine: the Routine read schema typed each exercise's `rest_seconds` as a string, but the Hevy API returns an integer. Correct the OpenAPI spec (and regenerated client) to type it as an integer and align the get-routine output contract, matching the Post/Put routine request schemas. get-routines was unaffected because its compact projection omits `rest_seconds`.

## 0.0.1

### Patch Changes

- [#795](https://github.com/chrisdoc/hevy-mcp/pull/795) [`ba871dd`](https://github.com/chrisdoc/hevy-mcp/commit/ba871dda0dd14e125332be1cc534814737579480) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Bound Hevy response fetching and body consumption with per-attempt timeouts.
