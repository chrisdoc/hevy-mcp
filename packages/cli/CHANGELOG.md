# @chrisdoc/hevy-cli

## 1.2.6

### Patch Changes

- [#1074](https://github.com/chrisdoc/hevy-mcp/pull/1074) [`65970a1`](https://github.com/chrisdoc/hevy-mcp/commit/65970a1fc95f80b82e52e67cf45fd3481fdbcc45) Thanks [@manelpb](https://github.com/manelpb)! - Apply oxfmt 0.63.0 formatting to core mapped-type declarations in `execution.ts`, `tools/input-schemas.ts`, and `tools/tool-runtime.ts`. Formatting only — no functional change. `hevy-mcp` and `@chrisdoc/hevy-cli` get a patch bump solely because the release cascade re-releases core's consumers.

## 1.2.5

### Patch Changes

- [#1056](https://github.com/chrisdoc/hevy-mcp/pull/1056) [`3a29218`](https://github.com/chrisdoc/hevy-mcp/commit/3a29218d6b1d837eeecb5cb849396eee9f62e3e0) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Narrow the operations interface to the names consumers actually use; remove four dead exported predicates and stop re-exporting internal operation plumbing.

- [#1053](https://github.com/chrisdoc/hevy-mcp/pull/1053) [`4556c13`](https://github.com/chrisdoc/hevy-mcp/commit/4556c13e18fb7281788e86505b09985e1f061e62) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Export the safe-error diagnostic vocabulary (codes, methods, categories, stack sources) from core as its interface; the Worker adapter validates against the shared vocabulary instead of private copies. Folds the safe-error-diagnostic re-export into error-policy.

- [#1054](https://github.com/chrisdoc/hevy-mcp/pull/1054) [`1b83866`](https://github.com/chrisdoc/hevy-mcp/commit/1b83866030f004bc19ccb8ebc860828fc853957d) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Own the telemetry contract constants (user hash context, hash shape, argument-key allowlist) in core so the Node and Worker adapters cannot drift apart.

- [#1057](https://github.com/chrisdoc/hevy-mcp/pull/1057) [`139ae78`](https://github.com/chrisdoc/hevy-mcp/commit/139ae78a3293ebe401a13ea88f3946f29848577e) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Export the generated workout and routine set schemas from the curated schemas entry point and pin the MCP input enum vocabularies (RPE, set type) to them with a contract test, so upstream enum changes surface at test time instead of drifting.

- [#1051](https://github.com/chrisdoc/hevy-mcp/pull/1051) [`2cd03b0`](https://github.com/chrisdoc/hevy-mcp/commit/2cd03b09d8d59d19118a4af81ae568f34914441a) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Scan all reported training-summary pages so later workouts and body measurements are not hidden by older records on earlier pages, and apply the same fix to the `hevy` CLI summary export.

- [#1052](https://github.com/chrisdoc/hevy-mcp/pull/1052) [`5c9a57a`](https://github.com/chrisdoc/hevy-mcp/commit/5c9a57aead4e7b64d4dbfae7785742be26eaf196) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Split response-contracts into output-schemas and formatters modules with no behavior change; response contract wiring stays in response-contracts.

- [#1055](https://github.com/chrisdoc/hevy-mcp/pull/1055) [`4f2b707`](https://github.com/chrisdoc/hevy-mcp/commit/4f2b7074505948b3dfb6021f9e0e20fd971a66d6) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Give the workout is_private quirk one home in hevy-quirks; the runtime rule, user-facing error, and tool-description clauses all derive from the same constants so they cannot drift.

## 1.2.4

### Patch Changes

- [#1049](https://github.com/chrisdoc/hevy-mcp/pull/1049) [`e7934bb`](https://github.com/chrisdoc/hevy-mcp/commit/e7934bb0d01ef1bbb9915bbd1252998fa25c440a) Thanks [@jacksonpradolima](https://github.com/jacksonpradolima)! - Fix update-workout failing with Hevy API HTTP 500 when is_private is omitted.
  
  The upstream Hevy API requires `is_private` in PUT requests, but the GET endpoint does not return it. The tool description stated that omitted fields remain unchanged, but this was not true for `is_private` due to API contract mismatch.
  
  Changes:
  
  - Add validation in `update-workout` to require explicit `is_private` value, preventing the opaque transient-error from the API
  - Add `is_private` requirement to `replace-workout-exercises` schema and tool handler
  - Improve error message handling to preserve safe user-facing error messages while blocking sensitive information
  - Add regression test for metadata-only workout updates

## 1.2.3

### Patch Changes

- [#1036](https://github.com/chrisdoc/hevy-mcp/pull/1036) [`a9a7594`](https://github.com/chrisdoc/hevy-mcp/commit/a9a75943e32656299fc0f523d0eed5848d8d64bc) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Clarify canonical MCP tool names and require tool parameters to be sent in the arguments object.

- [#1033](https://github.com/chrisdoc/hevy-mcp/pull/1033) [`331a3bc`](https://github.com/chrisdoc/hevy-mcp/commit/331a3bc77d462161fc2922a5ece22d39a6d0c839) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Increase the default Hevy API operation deadline to accommodate slow, large collection responses.

- [#1033](https://github.com/chrisdoc/hevy-mcp/pull/1033) [`331a3bc`](https://github.com/chrisdoc/hevy-mcp/commit/331a3bc77d462161fc2922a5ece22d39a6d0c839) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Return a structured, confirmed acknowledgement from `create-routine`, including the authoritative routine when Hevy provides one.

- [#1032](https://github.com/chrisdoc/hevy-mcp/pull/1032) [`ad391b1`](https://github.com/chrisdoc/hevy-mcp/commit/ad391b17ac96761f9c05d7d107009d73fde096e7) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Treat Hevy's HTTP 400 workout validation responses as actionable input errors instead of generic API failures.

- [#1031](https://github.com/chrisdoc/hevy-mcp/pull/1031) [`ae58ddd`](https://github.com/chrisdoc/hevy-mcp/commit/ae58ddd420289d7fb53a84f02e5e01d021c61ab6) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Use endpoint-agnostic guidance for HTTP 409 conflicts so routine conflicts are not described as body measurement conflicts.

- [#1036](https://github.com/chrisdoc/hevy-mcp/pull/1036) [`a9a7594`](https://github.com/chrisdoc/hevy-mcp/commit/a9a75943e32656299fc0f523d0eed5848d8d64bc) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Improve the error guidance when updating a routine that no longer exists in Hevy.

- [#1045](https://github.com/chrisdoc/hevy-mcp/pull/1045) [`cd46318`](https://github.com/chrisdoc/hevy-mcp/commit/cd4631886e98119d548e16017bb12071c0bbc5dd) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Reduce per-request CPU in the Worker: memoize tool schema registration once per isolate, and preload the actual compact-JSON-Schema conversions at module scope so the first request only reads already-converted schemas. This eliminates the repeated conversion that caused intermittent `Worker exceeded CPU time limit` (503) responses.

## 1.2.2

### Patch Changes

- [#1015](https://github.com/chrisdoc/hevy-mcp/pull/1015) [`0e4d8a3`](https://github.com/chrisdoc/hevy-mcp/commit/0e4d8a33a54f07670aeb8a53d575981010a0f7e7) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add the anti-slop Oxlint plugin and migrate omission-preserving response projection helpers to a shared typed helper.

- [#1028](https://github.com/chrisdoc/hevy-mcp/pull/1028) [`f1ac721`](https://github.com/chrisdoc/hevy-mcp/commit/f1ac721f3a99c5b3be0e2c2af417441db4793262) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Advertise required routine exercise arrays consistently and document the wrapped snake_case `create-routine` payload.

## 1.2.1

### Patch Changes

- [#968](https://github.com/chrisdoc/hevy-mcp/pull/968) [`23afac3`](https://github.com/chrisdoc/hevy-mcp/commit/23afac3c4ab0d66b60cb193d9efc86b598b1d6da) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Use Oxfmt for generated client formatting and remove the repository's Prettier dependency.

- [#968](https://github.com/chrisdoc/hevy-mcp/pull/968) [`23afac3`](https://github.com/chrisdoc/hevy-mcp/commit/23afac3c4ab0d66b60cb193d9efc86b598b1d6da) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Capture bounded, allowlisted, redacted upstream error details in API diagnostics without adding response text to metrics.

## 1.2.0

### Minor Changes

- [#944](https://github.com/chrisdoc/hevy-mcp/pull/944) [`1ae0e10`](https://github.com/chrisdoc/hevy-mcp/commit/1ae0e1017646a1fe843a35c984537995e2521f7e) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Centralize typed Hevy endpoint identity and transient error policy across client, operations, Core, and Node observability.

### Patch Changes

- [#957](https://github.com/chrisdoc/hevy-mcp/pull/957) [`66aca90`](https://github.com/chrisdoc/hevy-mcp/commit/66aca90eba1ced4ceab76fc7d0babd87850b483e) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Ban `Record<string, unknown>` in Oxlint and replace existing uses with named object types or narrower `object` types.

- [#952](https://github.com/chrisdoc/hevy-mcp/pull/952) [`6d9d4a5`](https://github.com/chrisdoc/hevy-mcp/commit/6d9d4a5078d44a36bd4b5d991fe58b1bb756d3b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add a production-owned read capability descriptor and bounded Core, Node HTTP, and Worker contract-matrix coverage.

- [#943](https://github.com/chrisdoc/hevy-mcp/pull/943) [`011da15`](https://github.com/chrisdoc/hevy-mcp/commit/011da159445a1a5240f95a7c0ae3c26a1f70966a) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Reuse the shared prebuilt CLI package tarball in package smoke validation.

- [#960](https://github.com/chrisdoc/hevy-mcp/pull/960) [`8d63b10`](https://github.com/chrisdoc/hevy-mcp/commit/8d63b10897815913c59e8054fc1410bd95f3081c) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Normalize ISO timestamp variants returned by Hevy before workout updates and keep expected MCP caller validation failures out of Sentry issues.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Keep the typed workout tool test fixture aligned with operation descriptors.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add a typed routines get operation and use it from Core while preserving the CLI get path.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add a typed routines list operation and use it from Core and the CLI.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Enforce type-aware async function usage with Oxlint.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add a typed workouts get operation and use it from Core while preserving the CLI get path.

## 1.1.1

### Patch Changes

- [#907](https://github.com/chrisdoc/hevy-mcp/pull/907) [`4dec481`](https://github.com/chrisdoc/hevy-mcp/commit/4dec481875cb97041ab558177f94c859fe48ee3f) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Update Kubb and related development dependencies, and refresh the generated Hevy API client.

- [#933](https://github.com/chrisdoc/hevy-mcp/pull/933) [`5fca900`](https://github.com/chrisdoc/hevy-mcp/commit/5fca9009b2c125dcba6694cb506f986dba026206) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Remove MCP tools that duplicate the `hevy://user`, `hevy://workout-count`, `hevy://exercise-templates`, and `hevy://routine-folders` resources. Clients should use those resources for complete datasets and retain `search-exercise-templates` for filtered catalog searches.

## 1.1.0

### Minor Changes

- [#887](https://github.com/chrisdoc/hevy-mcp/pull/887) [`976f570`](https://github.com/chrisdoc/hevy-mcp/commit/976f570fe1a0258ee5442002c830385dc888ad72) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add invocation-scoped cancellation, absolute deadlines, commit-state outcomes, and safe retry diagnostics across the Hevy client, MCP adapters, Worker, Node server, and CLI.

### Patch Changes

- [#890](https://github.com/chrisdoc/hevy-mcp/pull/890) [`5f78f33`](https://github.com/chrisdoc/hevy-mcp/commit/5f78f334c01016580fcff8af895d50997ef9ae87) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Keep generated client output complete and reproducible while centralizing
  repository topology, artifact provenance, and validation lanes.

- [#902](https://github.com/chrisdoc/hevy-mcp/pull/902) [`cafe0c6`](https://github.com/chrisdoc/hevy-mcp/commit/cafe0c624de9804c11a93b20f2364c4e742c6cc3) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Share the typed workouts.list operation between the MCP server and CLI.

## 1.0.1

### Patch Changes

- [#839](https://github.com/chrisdoc/hevy-mcp/pull/839) [`e4087e5`](https://github.com/chrisdoc/hevy-mcp/commit/e4087e55b47590d9492ba0742fa14edd6d7d440e) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Make the CLI package smoke test safe across filesystem devices.

## 1.0.0

### Major Changes

- [#775](https://github.com/chrisdoc/hevy-mcp/pull/775) [`9518fcc`](https://github.com/chrisdoc/hevy-mcp/commit/9518fccc98f3843303d51436469db57a1898beb6) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Compact the MCP tool catalog and structured responses while preserving direct tool workflows.

## 0.2.0

### Minor Changes

- [#772](https://github.com/chrisdoc/hevy-mcp/pull/772) [`76981a1`](https://github.com/chrisdoc/hevy-mcp/commit/76981a12b2ec125d748e22b00ec975a9d49bd951) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add create and update commands for Hevy resources.

## 0.1.2

### Patch Changes

- [#761](https://github.com/chrisdoc/hevy-mcp/pull/761) [`205cbff`](https://github.com/chrisdoc/hevy-mcp/commit/205cbffe060fa4d74dac349ac1cc9d2c7f6505cc) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Build the CLI bundle during npm packaging so published installs include the `hevy` executable.

## 0.1.1

### Patch Changes

- [#756](https://github.com/chrisdoc/hevy-mcp/pull/756) [`90756f6`](https://github.com/chrisdoc/hevy-mcp/commit/90756f69d850619baa0ef391e8e4f9fca579dca9) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Include repository metadata in published package manifests for npm provenance validation.

## 0.1.0

### Minor Changes

- [#752](https://github.com/chrisdoc/hevy-mcp/pull/752) [`e0243ce`](https://github.com/chrisdoc/hevy-mcp/commit/e0243ce35035bb7314c020872b7701116f92c359) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add the initial read-only `hevy` command-line interface with environment-only authentication and bundled API client.

### Patch Changes

- [#752](https://github.com/chrisdoc/hevy-mcp/pull/752) [`e0243ce`](https://github.com/chrisdoc/hevy-mcp/commit/e0243ce35035bb7314c020872b7701116f92c359) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Use Stricli for CLI argument parsing and generated help output.

- [#752](https://github.com/chrisdoc/hevy-mcp/pull/752) [`e0243ce`](https://github.com/chrisdoc/hevy-mcp/commit/e0243ce35035bb7314c020872b7701116f92c359) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Validate semantic CLI arguments with Zod schemas derived from the Hevy API client while preserving Stricli command parsing and process contracts.
