# @hevy-mcp/core

## 0.2.1

### Patch Changes

- [#968](https://github.com/chrisdoc/hevy-mcp/pull/968) [`23afac3`](https://github.com/chrisdoc/hevy-mcp/commit/23afac3c4ab0d66b60cb193d9efc86b598b1d6da) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Use Oxfmt for generated client formatting and remove the repository's Prettier dependency.

- [#968](https://github.com/chrisdoc/hevy-mcp/pull/968) [`23afac3`](https://github.com/chrisdoc/hevy-mcp/commit/23afac3c4ab0d66b60cb193d9efc86b598b1d6da) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Capture bounded, allowlisted, redacted upstream error details in API diagnostics without adding response text to metrics.
- Updated dependencies [[`23afac3`](https://github.com/chrisdoc/hevy-mcp/commit/23afac3c4ab0d66b60cb193d9efc86b598b1d6da), [`23afac3`](https://github.com/chrisdoc/hevy-mcp/commit/23afac3c4ab0d66b60cb193d9efc86b598b1d6da)]:
  - @hevy-mcp/hevy-client@0.2.1
  - @hevy-mcp/operations@0.1.1

## 0.2.0

### Minor Changes

- [#944](https://github.com/chrisdoc/hevy-mcp/pull/944) [`1ae0e10`](https://github.com/chrisdoc/hevy-mcp/commit/1ae0e1017646a1fe843a35c984537995e2521f7e) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Centralize typed Hevy endpoint identity and transient error policy across client, operations, Core, and Node observability.

### Patch Changes

- [#957](https://github.com/chrisdoc/hevy-mcp/pull/957) [`66aca90`](https://github.com/chrisdoc/hevy-mcp/commit/66aca90eba1ced4ceab76fc7d0babd87850b483e) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Ban `Record<string, unknown>` in Oxlint and replace existing uses with named object types or narrower `object` types.

- [#952](https://github.com/chrisdoc/hevy-mcp/pull/952) [`6d9d4a5`](https://github.com/chrisdoc/hevy-mcp/commit/6d9d4a5078d44a36bd4b5d991fe58b1bb756d3b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add a production-owned read capability descriptor and bounded Core, Node HTTP, and Worker contract-matrix coverage.

- [#960](https://github.com/chrisdoc/hevy-mcp/pull/960) [`8d63b10`](https://github.com/chrisdoc/hevy-mcp/commit/8d63b10897815913c59e8054fc1410bd95f3081c) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Normalize ISO timestamp variants returned by Hevy before workout updates and keep expected MCP caller validation failures out of Sentry issues.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Keep the typed workout tool test fixture aligned with operation descriptors.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add a typed routines get operation and use it from Core while preserving the CLI get path.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add a typed routines list operation and use it from Core and the CLI.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Enforce type-aware async function usage with Oxlint.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add a typed workouts get operation and use it from Core while preserving the CLI get path.
- Updated dependencies [[`1ae0e10`](https://github.com/chrisdoc/hevy-mcp/commit/1ae0e1017646a1fe843a35c984537995e2521f7e), [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4), [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4), [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4), [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4)]:
  - @hevy-mcp/hevy-client@0.2.0
  - @hevy-mcp/operations@0.1.0

## 0.1.1

### Patch Changes

- [#907](https://github.com/chrisdoc/hevy-mcp/pull/907) [`4dec481`](https://github.com/chrisdoc/hevy-mcp/commit/4dec481875cb97041ab558177f94c859fe48ee3f) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Update Kubb and related development dependencies, and refresh the generated Hevy API client.

- [#933](https://github.com/chrisdoc/hevy-mcp/pull/933) [`5fca900`](https://github.com/chrisdoc/hevy-mcp/commit/5fca9009b2c125dcba6694cb506f986dba026206) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Remove MCP tools that duplicate the `hevy://user`, `hevy://workout-count`, `hevy://exercise-templates`, and `hevy://routine-folders` resources. Clients should use those resources for complete datasets and retain `search-exercise-templates` for filtered catalog searches.
- Updated dependencies [[`4dec481`](https://github.com/chrisdoc/hevy-mcp/commit/4dec481875cb97041ab558177f94c859fe48ee3f)]:
  - @hevy-mcp/hevy-client@0.1.1
  - @hevy-mcp/operations@0.0.3

## 0.1.0

### Minor Changes

- [#887](https://github.com/chrisdoc/hevy-mcp/pull/887) [`976f570`](https://github.com/chrisdoc/hevy-mcp/commit/976f570fe1a0258ee5442002c830385dc888ad72) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add invocation-scoped cancellation, absolute deadlines, commit-state outcomes, and safe retry diagnostics across the Hevy client, MCP adapters, Worker, Node server, and CLI.

### Patch Changes

- [#890](https://github.com/chrisdoc/hevy-mcp/pull/890) [`5f78f33`](https://github.com/chrisdoc/hevy-mcp/commit/5f78f334c01016580fcff8af895d50997ef9ae87) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Keep generated client output complete and reproducible while centralizing
  repository topology, artifact provenance, and validation lanes.

- [#902](https://github.com/chrisdoc/hevy-mcp/pull/902) [`cafe0c6`](https://github.com/chrisdoc/hevy-mcp/commit/cafe0c624de9804c11a93b20f2364c4e742c6cc3) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Share the typed workouts.list operation between the MCP server and CLI.

- Updated dependencies [[`5f78f33`](https://github.com/chrisdoc/hevy-mcp/commit/5f78f334c01016580fcff8af895d50997ef9ae87), [`976f570`](https://github.com/chrisdoc/hevy-mcp/commit/976f570fe1a0258ee5442002c830385dc888ad72), [`cafe0c6`](https://github.com/chrisdoc/hevy-mcp/commit/cafe0c624de9804c11a93b20f2364c4e742c6cc3)]:
  - @hevy-mcp/hevy-client@0.1.0
  - @hevy-mcp/operations@0.0.2

## 0.0.4

### Patch Changes

- [#848](https://github.com/chrisdoc/hevy-mcp/pull/848) [`11d55d2`](https://github.com/chrisdoc/hevy-mcp/commit/11d55d238cfc4e874d470d798206c349fda4d9d0) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add privacy-safe MCP session correlation and richer request lifecycle telemetry.

- [#848](https://github.com/chrisdoc/hevy-mcp/pull/848) [`11d55d2`](https://github.com/chrisdoc/hevy-mcp/commit/11d55d238cfc4e874d470d798206c349fda4d9d0) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add bounded, privacy-safe failure events and expected outcome classification.

- Updated dependencies [[`11d55d2`](https://github.com/chrisdoc/hevy-mcp/commit/11d55d238cfc4e874d470d798206c349fda4d9d0), [`11d55d2`](https://github.com/chrisdoc/hevy-mcp/commit/11d55d238cfc4e874d470d798206c349fda4d9d0)]:
  - @hevy-mcp/hevy-client@0.0.3

## 0.0.3

### Patch Changes

- [#842](https://github.com/chrisdoc/hevy-mcp/pull/842) [`de9aad0`](https://github.com/chrisdoc/hevy-mcp/commit/de9aad0268495ac3583e4198cb9d1f29991865b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Unify privacy-safe MCP tool failure events across runtimes.

## 0.0.2

### Patch Changes

- [#833](https://github.com/chrisdoc/hevy-mcp/pull/833) [`39d5896`](https://github.com/chrisdoc/hevy-mcp/commit/39d589617b1a83ae36a97ce6b52aa89f022681e5) Thanks [@neontty](https://github.com/neontty)! - Fix get-routine failing for every routine: the Routine read schema typed each exercise's `rest_seconds` as a string, but the Hevy API returns an integer. Correct the OpenAPI spec (and regenerated client) to type it as an integer and align the get-routine output contract, matching the Post/Put routine request schemas. get-routines was unaffected because its compact projection omits `rest_seconds`.

- Updated dependencies [[`39d5896`](https://github.com/chrisdoc/hevy-mcp/commit/39d589617b1a83ae36a97ce6b52aa89f022681e5)]:
  - @hevy-mcp/hevy-client@0.0.2

## 0.0.1

### Patch Changes

- [#795](https://github.com/chrisdoc/hevy-mcp/pull/795) [`ba871dd`](https://github.com/chrisdoc/hevy-mcp/commit/ba871dda0dd14e125332be1cc534814737579480) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Bound Hevy response fetching and body consumption with per-attempt timeouts.

- Updated dependencies [[`ba871dd`](https://github.com/chrisdoc/hevy-mcp/commit/ba871dda0dd14e125332be1cc534814737579480)]:
  - @hevy-mcp/hevy-client@0.0.1
