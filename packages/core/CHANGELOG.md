# @hevy-mcp/core

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
