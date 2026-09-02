# hevy-mcp

## 6.1.9

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

## 6.1.8

### Patch Changes

- [#1078](https://github.com/chrisdoc/hevy-mcp/pull/1078) [`9e86cb2`](https://github.com/chrisdoc/hevy-mcp/commit/9e86cb269e5d1ceedf9eb0f0208559d288bb297f) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Guard `mergeAbortSignals` with an `AbortSignal.any` capability check and a manual composition fallback so self-hosted Node runtimes older than 20.3 no longer fail every tool dispatch with `TypeError: AbortSignal.any is not a function`.

- [#1083](https://github.com/chrisdoc/hevy-mcp/pull/1083) [`a9cca6b`](https://github.com/chrisdoc/hevy-mcp/commit/a9cca6bc167c7a296532d10d1a272851b43487a4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - chore: switch the repository package manager from npm to pnpm 12. Internal workspace dependencies use the `workspace:*` protocol, scripts/workflows/docs were migrated, and the lockfile is now `pnpm-lock.yaml`. No runtime behavior change.

- [#1081](https://github.com/chrisdoc/hevy-mcp/pull/1081) [`37ded34`](https://github.com/chrisdoc/hevy-mcp/commit/37ded345d7ea1b8639bd0ebe373a76c38f22a94d) Thanks [@chrisdoc](https://github.com/chrisdoc)! - chore(deps): update `@sentry/node` to 10.72.0, `@types/node` to 26.4.0, and `zod` to 4.5.2 within existing semver ranges.

- [#1080](https://github.com/chrisdoc/hevy-mcp/pull/1080) [`919ad8e`](https://github.com/chrisdoc/hevy-mcp/commit/919ad8e5da1bcd45c817727bedb5d1daedb25988) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Test-only: strengthen tool output-schema assertions and replace Git-based changeset fixtures with pure filesystem fixtures.

## 6.1.7

### Patch Changes

- [#1074](https://github.com/chrisdoc/hevy-mcp/pull/1074) [`65970a1`](https://github.com/chrisdoc/hevy-mcp/commit/65970a1fc95f80b82e52e67cf45fd3481fdbcc45) Thanks [@manelpb](https://github.com/manelpb)! - Apply oxfmt 0.63.0 formatting to core mapped-type declarations in `execution.ts`, `tools/input-schemas.ts`, and `tools/tool-runtime.ts`. Formatting only — no functional change. `hevy-mcp` and `@chrisdoc/hevy-cli` get a patch bump solely because the release cascade re-releases core's consumers.

## 6.1.6

### Patch Changes

- [#1056](https://github.com/chrisdoc/hevy-mcp/pull/1056) [`3a29218`](https://github.com/chrisdoc/hevy-mcp/commit/3a29218d6b1d837eeecb5cb849396eee9f62e3e0) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Narrow the operations interface to the names consumers actually use; remove four dead exported predicates and stop re-exporting internal operation plumbing.

- [#1053](https://github.com/chrisdoc/hevy-mcp/pull/1053) [`4556c13`](https://github.com/chrisdoc/hevy-mcp/commit/4556c13e18fb7281788e86505b09985e1f061e62) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Export the safe-error diagnostic vocabulary (codes, methods, categories, stack sources) from core as its interface; the Worker adapter validates against the shared vocabulary instead of private copies. Folds the safe-error-diagnostic re-export into error-policy.

- [#1054](https://github.com/chrisdoc/hevy-mcp/pull/1054) [`1b83866`](https://github.com/chrisdoc/hevy-mcp/commit/1b83866030f004bc19ccb8ebc860828fc853957d) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Own the telemetry contract constants (user hash context, hash shape, argument-key allowlist) in core so the Node and Worker adapters cannot drift apart.

- [#1057](https://github.com/chrisdoc/hevy-mcp/pull/1057) [`139ae78`](https://github.com/chrisdoc/hevy-mcp/commit/139ae78a3293ebe401a13ea88f3946f29848577e) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Export the generated workout and routine set schemas from the curated schemas entry point and pin the MCP input enum vocabularies (RPE, set type) to them with a contract test, so upstream enum changes surface at test time instead of drifting.

- [#1051](https://github.com/chrisdoc/hevy-mcp/pull/1051) [`2cd03b0`](https://github.com/chrisdoc/hevy-mcp/commit/2cd03b09d8d59d19118a4af81ae568f34914441a) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Scan all reported training-summary pages so later workouts and body measurements are not hidden by older records on earlier pages, and apply the same fix to the `hevy` CLI summary export.

- [#1052](https://github.com/chrisdoc/hevy-mcp/pull/1052) [`5c9a57a`](https://github.com/chrisdoc/hevy-mcp/commit/5c9a57aead4e7b64d4dbfae7785742be26eaf196) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Split response-contracts into output-schemas and formatters modules with no behavior change; response contract wiring stays in response-contracts.

- [#1055](https://github.com/chrisdoc/hevy-mcp/pull/1055) [`4f2b707`](https://github.com/chrisdoc/hevy-mcp/commit/4f2b7074505948b3dfb6021f9e0e20fd971a66d6) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Give the workout is_private quirk one home in hevy-quirks; the runtime rule, user-facing error, and tool-description clauses all derive from the same constants so they cannot drift.

## 6.1.5

### Patch Changes

- [#1049](https://github.com/chrisdoc/hevy-mcp/pull/1049) [`e7934bb`](https://github.com/chrisdoc/hevy-mcp/commit/e7934bb0d01ef1bbb9915bbd1252998fa25c440a) Thanks [@jacksonpradolima](https://github.com/jacksonpradolima)! - Fix update-workout failing with Hevy API HTTP 500 when is_private is omitted.
  
  The upstream Hevy API requires `is_private` in PUT requests, but the GET endpoint does not return it. The tool description stated that omitted fields remain unchanged, but this was not true for `is_private` due to API contract mismatch.
  
  Changes:
  
  - Add validation in `update-workout` to require explicit `is_private` value, preventing the opaque transient-error from the API
  - Add `is_private` requirement to `replace-workout-exercises` schema and tool handler
  - Improve error message handling to preserve safe user-facing error messages while blocking sensitive information
  - Add regression test for metadata-only workout updates

- [#1046](https://github.com/chrisdoc/hevy-mcp/pull/1046) [`3e53c0b`](https://github.com/chrisdoc/hevy-mcp/commit/3e53c0bcd6ba6b5403e437fa738f7d3c7e3b8d7c) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Document the Node package's updated 60-second default Hevy API timeout.

## 6.1.4

### Patch Changes

- [#1036](https://github.com/chrisdoc/hevy-mcp/pull/1036) [`a9a7594`](https://github.com/chrisdoc/hevy-mcp/commit/a9a75943e32656299fc0f523d0eed5848d8d64bc) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Clarify canonical MCP tool names and require tool parameters to be sent in the arguments object.

- [#1033](https://github.com/chrisdoc/hevy-mcp/pull/1033) [`331a3bc`](https://github.com/chrisdoc/hevy-mcp/commit/331a3bc77d462161fc2922a5ece22d39a6d0c839) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Increase the default Hevy API operation deadline to accommodate slow, large collection responses.

- [#1033](https://github.com/chrisdoc/hevy-mcp/pull/1033) [`331a3bc`](https://github.com/chrisdoc/hevy-mcp/commit/331a3bc77d462161fc2922a5ece22d39a6d0c839) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Return a structured, confirmed acknowledgement from `create-routine`, including the authoritative routine when Hevy provides one.

- [#1035](https://github.com/chrisdoc/hevy-mcp/pull/1035) [`b17ab5b`](https://github.com/chrisdoc/hevy-mcp/commit/b17ab5b74a592a37f905d954a334fbfd5e58ae5a) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Guard MCP telemetry session ID generation when `node:crypto.randomUUID` is unavailable.

- [#1032](https://github.com/chrisdoc/hevy-mcp/pull/1032) [`ad391b1`](https://github.com/chrisdoc/hevy-mcp/commit/ad391b17ac96761f9c05d7d107009d73fde096e7) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Treat Hevy's HTTP 400 workout validation responses as actionable input errors instead of generic API failures.

- [#1031](https://github.com/chrisdoc/hevy-mcp/pull/1031) [`ae58ddd`](https://github.com/chrisdoc/hevy-mcp/commit/ae58ddd420289d7fb53a84f02e5e01d021c61ab6) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Use endpoint-agnostic guidance for HTTP 409 conflicts so routine conflicts are not described as body measurement conflicts.

- [#1036](https://github.com/chrisdoc/hevy-mcp/pull/1036) [`a9a7594`](https://github.com/chrisdoc/hevy-mcp/commit/a9a75943e32656299fc0f523d0eed5848d8d64bc) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Improve the error guidance when updating a routine that no longer exists in Hevy.

- [#1034](https://github.com/chrisdoc/hevy-mcp/pull/1034) [`1a6b016`](https://github.com/chrisdoc/hevy-mcp/commit/1a6b016de37d0772e8fc8ee71f664dc8114b0ac4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Improve the startup guidance when non-loopback HTTP mode is missing its bearer token.

- [#1030](https://github.com/chrisdoc/hevy-mcp/pull/1030) [`1bae2ba`](https://github.com/chrisdoc/hevy-mcp/commit/1bae2ba660f7fb702d4d70ae34b8d6701df4591e) Thanks [@chrisdoc](https://github.com/chrisdoc)! - docs: clarify Hevy API authentication failures

- [#1045](https://github.com/chrisdoc/hevy-mcp/pull/1045) [`cd46318`](https://github.com/chrisdoc/hevy-mcp/commit/cd4631886e98119d548e16017bb12071c0bbc5dd) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Reduce per-request CPU in the Worker: memoize tool schema registration once per isolate, and preload the actual compact-JSON-Schema conversions at module scope so the first request only reads already-converted schemas. This eliminates the repeated conversion that caused intermittent `Worker exceeded CPU time limit` (503) responses.

- [#1042](https://github.com/chrisdoc/hevy-mcp/pull/1042) [`31bf76a`](https://github.com/chrisdoc/hevy-mcp/commit/31bf76a8d6f6a5305de5637e359eae086677f9f7) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Adapt telemetry and Worker tracing fallbacks to the upgraded Cloudflare Workers types and Node type definitions.

## 6.1.3

### Patch Changes

- [#1015](https://github.com/chrisdoc/hevy-mcp/pull/1015) [`0e4d8a3`](https://github.com/chrisdoc/hevy-mcp/commit/0e4d8a33a54f07670aeb8a53d575981010a0f7e7) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add the anti-slop Oxlint plugin and migrate omission-preserving response projection helpers to a shared typed helper.

- [#1028](https://github.com/chrisdoc/hevy-mcp/pull/1028) [`f1ac721`](https://github.com/chrisdoc/hevy-mcp/commit/f1ac721f3a99c5b3be0e2c2af417441db4793262) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Advertise required routine exercise arrays consistently and document the wrapped snake_case `create-routine` payload.

## 6.1.2

### Patch Changes

- [#989](https://github.com/chrisdoc/hevy-mcp/pull/989) [`f34db48`](https://github.com/chrisdoc/hevy-mcp/commit/f34db48e503263c52de1e1f8261e0587a43cec9b) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Propagate the bounded HMAC `user.hash` pseudonym onto Node tool, discovery, and prompt activity spans without exporting raw Hevy API keys.

## 6.1.1

### Patch Changes

- [#980](https://github.com/chrisdoc/hevy-mcp/pull/980) [`ac18809`](https://github.com/chrisdoc/hevy-mcp/commit/ac18809a23ef04a6f9d75bb3138611385cc5ab7f) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Update the published Node package documentation to use the current hosted MCP endpoint.

- [#968](https://github.com/chrisdoc/hevy-mcp/pull/968) [`23afac3`](https://github.com/chrisdoc/hevy-mcp/commit/23afac3c4ab0d66b60cb193d9efc86b598b1d6da) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Treat unknown MCP tool calls as expected caller validation failures instead of reporting them as Sentry errors.

- [#968](https://github.com/chrisdoc/hevy-mcp/pull/968) [`23afac3`](https://github.com/chrisdoc/hevy-mcp/commit/23afac3c4ab0d66b60cb193d9efc86b598b1d6da) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Use Oxfmt for generated client formatting and remove the repository's Prettier dependency.

- [#968](https://github.com/chrisdoc/hevy-mcp/pull/968) [`23afac3`](https://github.com/chrisdoc/hevy-mcp/commit/23afac3c4ab0d66b60cb193d9efc86b598b1d6da) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Capture bounded, allowlisted, redacted upstream error details in API diagnostics without adding response text to metrics.

## 6.1.0

### Minor Changes

- [#944](https://github.com/chrisdoc/hevy-mcp/pull/944) [`1ae0e10`](https://github.com/chrisdoc/hevy-mcp/commit/1ae0e1017646a1fe843a35c984537995e2521f7e) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Centralize typed Hevy endpoint identity and transient error policy across client, operations, Core, and Node observability.

### Patch Changes

- [#957](https://github.com/chrisdoc/hevy-mcp/pull/957) [`66aca90`](https://github.com/chrisdoc/hevy-mcp/commit/66aca90eba1ced4ceab76fc7d0babd87850b483e) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Ban `Record<string, unknown>` in Oxlint and replace existing uses with named object types or narrower `object` types.

- [#948](https://github.com/chrisdoc/hevy-mcp/pull/948) [`1333a59`](https://github.com/chrisdoc/hevy-mcp/commit/1333a59f54a6ab5dbae0b3498b0d31ac9aacfc86) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Share the private Node process lifecycle owner across stdio and HTTP startup paths.

- [#952](https://github.com/chrisdoc/hevy-mcp/pull/952) [`6d9d4a5`](https://github.com/chrisdoc/hevy-mcp/commit/6d9d4a5078d44a36bd4b5d991fe58b1bb756d3b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add a production-owned read capability descriptor and bounded Core, Node HTTP, and Worker contract-matrix coverage.

- [#960](https://github.com/chrisdoc/hevy-mcp/pull/960) [`8d63b10`](https://github.com/chrisdoc/hevy-mcp/commit/8d63b10897815913c59e8054fc1410bd95f3081c) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Normalize ISO timestamp variants returned by Hevy before workout updates and keep expected MCP caller validation failures out of Sentry issues.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Keep the typed workout tool test fixture aligned with operation descriptors.

- [#947](https://github.com/chrisdoc/hevy-mcp/pull/947) [`5c07cd8`](https://github.com/chrisdoc/hevy-mcp/commit/5c07cd8daf9ceb9e2dbc5c38cca74c79ee4ed2a2) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Make the package-root Node API safe for embedding by separating it from executable telemetry and lifecycle startup.

- [#951](https://github.com/chrisdoc/hevy-mcp/pull/951) [`007127b`](https://github.com/chrisdoc/hevy-mcp/commit/007127b0644333342382cf17a8eb3884729a9c4d) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Bound Node Streamable HTTP session admission, request body deadlines, and idle session cleanup.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add a typed routines get operation and use it from Core while preserving the CLI get path.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add a typed routines list operation and use it from Core and the CLI.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Enforce type-aware async function usage with Oxlint.

- [#946](https://github.com/chrisdoc/hevy-mcp/pull/946) [`1e5aed4`](https://github.com/chrisdoc/hevy-mcp/commit/1e5aed4a84ff7515d05ec46f06b0555c6814a4b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add a typed workouts get operation and use it from Core while preserving the CLI get path.

## 6.0.0

### Major Changes

- [#933](https://github.com/chrisdoc/hevy-mcp/pull/933) [`5fca900`](https://github.com/chrisdoc/hevy-mcp/commit/5fca9009b2c125dcba6694cb506f986dba026206) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Remove MCP tools that duplicate the `hevy://user`, `hevy://workout-count`, `hevy://exercise-templates`, and `hevy://routine-folders` resources. Clients should use those resources for complete datasets and retain `search-exercise-templates` for filtered catalog searches.

### Patch Changes

- [#936](https://github.com/chrisdoc/hevy-mcp/pull/936) [`a142826`](https://github.com/chrisdoc/hevy-mcp/commit/a142826339f473a0ebdca58a9e624046cb15ab0a) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Correct stale MCP tool counts in the published documentation.

- [#907](https://github.com/chrisdoc/hevy-mcp/pull/907) [`4dec481`](https://github.com/chrisdoc/hevy-mcp/commit/4dec481875cb97041ab558177f94c859fe48ee3f) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Update Kubb and related development dependencies, and refresh the generated Hevy API client.

- [#931](https://github.com/chrisdoc/hevy-mcp/pull/931) [`47f399f`](https://github.com/chrisdoc/hevy-mcp/commit/47f399f4b63c15fd2fafe9667fd578eae80fd6c6) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Improve Node error reporting with Sentry release diagnostics and centralized
  sanitized exception telemetry while keeping OpenTelemetry traces independent.

## 5.1.0

### Minor Changes

- [#887](https://github.com/chrisdoc/hevy-mcp/pull/887) [`976f570`](https://github.com/chrisdoc/hevy-mcp/commit/976f570fe1a0258ee5442002c830385dc888ad72) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add invocation-scoped cancellation, absolute deadlines, commit-state outcomes, and safe retry diagnostics across the Hevy client, MCP adapters, Worker, Node server, and CLI.

### Patch Changes

- [#904](https://github.com/chrisdoc/hevy-mcp/pull/904) [`8ecf3f5`](https://github.com/chrisdoc/hevy-mcp/commit/8ecf3f5ceee778cca0df942fda702d1c2195c03d) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Document the 30-second OpenTelemetry metric export interval.

- [#890](https://github.com/chrisdoc/hevy-mcp/pull/890) [`5f78f33`](https://github.com/chrisdoc/hevy-mcp/commit/5f78f334c01016580fcff8af895d50997ef9ae87) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Keep generated client output complete and reproducible while centralizing
  repository topology, artifact provenance, and validation lanes.

- [#905](https://github.com/chrisdoc/hevy-mcp/pull/905) [`3050d11`](https://github.com/chrisdoc/hevy-mcp/commit/3050d113bc808025d567b71c3004c7604aba8a3f) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Keep the packaged GlitchTip DSN while suppressing Sentry client reports for dropped spans.

- [#902](https://github.com/chrisdoc/hevy-mcp/pull/902) [`cafe0c6`](https://github.com/chrisdoc/hevy-mcp/commit/cafe0c624de9804c11a93b20f2364c4e742c6cc3) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Share the typed workouts.list operation between the MCP server and CLI.

- [#896](https://github.com/chrisdoc/hevy-mcp/pull/896) [`dea8542`](https://github.com/chrisdoc/hevy-mcp/commit/dea8542d7fdf06971519607a13713b970b560f86) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Clarify that `SENTRY_RELEASE` labels local Sentry error events.

## 5.0.6

### Patch Changes

- [#867](https://github.com/chrisdoc/hevy-mcp/pull/867) [`01bc861`](https://github.com/chrisdoc/hevy-mcp/commit/01bc8617d9a5130d55fdd3e661ec8af0290d5ca7) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Send the Node package's default error telemetry to the self-hosted GlitchTip
  project while retaining trace and metric export through the existing OTel
  collector.

- [#895](https://github.com/chrisdoc/hevy-mcp/pull/895) [`d51bf30`](https://github.com/chrisdoc/hevy-mcp/commit/d51bf30a1c81ddf3780e4626b4ee65f2abd79eae) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Reduce Node telemetry volume by exporting metrics every 30 seconds, removing
  result-shape dimensions from tool-duration metrics, and normalizing dynamic API
  endpoint labels while retaining the detailed trace attributes.

## 5.0.5

### Patch Changes

- [#850](https://github.com/chrisdoc/hevy-mcp/pull/850) [`fe6ef1d`](https://github.com/chrisdoc/hevy-mcp/commit/fe6ef1d0351af7e8128cb5a33a8eb01b32084540) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Enrich SDK protocol spans and export privacy-safe failure events.

## 5.0.4

### Patch Changes

- [#848](https://github.com/chrisdoc/hevy-mcp/pull/848) [`11d55d2`](https://github.com/chrisdoc/hevy-mcp/commit/11d55d238cfc4e874d470d798206c349fda4d9d0) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Make OTLP metrics process-safe and add portable ClickStack operational views.

- [#848](https://github.com/chrisdoc/hevy-mcp/pull/848) [`11d55d2`](https://github.com/chrisdoc/hevy-mcp/commit/11d55d238cfc4e874d470d798206c349fda4d9d0) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add privacy-safe MCP session correlation and richer request lifecycle telemetry.

- [#848](https://github.com/chrisdoc/hevy-mcp/pull/848) [`11d55d2`](https://github.com/chrisdoc/hevy-mcp/commit/11d55d238cfc4e874d470d798206c349fda4d9d0) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add bounded, privacy-safe failure events and expected outcome classification.

## 5.0.3

### Patch Changes

- [#839](https://github.com/chrisdoc/hevy-mcp/pull/839) [`aa57348`](https://github.com/chrisdoc/hevy-mcp/commit/aa57348cf0cd7a41d5109c676319ef4377a83994) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Record tool thrown-error and returned-error exceptions as OpenTelemetry span exception events; add process-level uncaughtExceptionMonitor and unhandledRejection telemetry tracking.

- [#842](https://github.com/chrisdoc/hevy-mcp/pull/842) [`de9aad0`](https://github.com/chrisdoc/hevy-mcp/commit/de9aad0268495ac3583e4198cb9d1f29991865b4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Unify privacy-safe MCP tool failure events across runtimes.

## 5.0.2

### Patch Changes

- [#835](https://github.com/chrisdoc/hevy-mcp/pull/835) [`64800ce`](https://github.com/chrisdoc/hevy-mcp/commit/64800cec91613ed9c95550581b9c8872545f746a) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Preserve the corrected routine OpenAPI contract across future spec refreshes.

## 5.0.1

### Patch Changes

- [#796](https://github.com/chrisdoc/hevy-mcp/pull/796) [`8ca3b7c`](https://github.com/chrisdoc/hevy-mcp/commit/8ca3b7c1b980ebcf0d7e2868d57d91b9a9baf7fc) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Ignore malformed MCP stdin lines after recording bounded diagnostics so valid subsequent messages continue processing.

## 5.0.0

### Major Changes

- [#775](https://github.com/chrisdoc/hevy-mcp/pull/775) [`9518fcc`](https://github.com/chrisdoc/hevy-mcp/commit/9518fccc98f3843303d51436469db57a1898beb6) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Compact the MCP tool catalog and structured responses while preserving direct tool workflows.

- [#778](https://github.com/chrisdoc/hevy-mcp/pull/778) [`dcfc058`](https://github.com/chrisdoc/hevy-mcp/commit/dcfc058723327e7ca02f2e0d84ace5247ecfd6ac) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Change `update-workout` to patch workout metadata without replacing exercises, and add `replace-workout-exercises` for explicit exercise replacement.

## 4.1.4

### Patch Changes

- [#780](https://github.com/chrisdoc/hevy-mcp/pull/780) [`14b4b01`](https://github.com/chrisdoc/hevy-mcp/commit/14b4b01d8cfcafe6489de5dbbee5f15474d9d82e) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Reduce OAuth refresh frequency to keep Cloudflare KV writes below the free-plan quota while preserving refresh-token support.

## 4.1.3

### Patch Changes

- [#774](https://github.com/chrisdoc/hevy-mcp/pull/774) [`12ca7d5`](https://github.com/chrisdoc/hevy-mcp/commit/12ca7d5362024f06d8c2b0a42e84a92e2087a077) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Migrate the server runtimes and tests to MCP TypeScript SDK v2.

## 4.1.2

### Patch Changes

- [#764](https://github.com/chrisdoc/hevy-mcp/pull/764) [`c2b7352`](https://github.com/chrisdoc/hevy-mcp/commit/c2b73527966454ccc8cd9fd475f132225fbf2af1) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Update runtime dependency versions

## 4.1.1

### Patch Changes

- [#762](https://github.com/chrisdoc/hevy-mcp/pull/762) [`187b93f`](https://github.com/chrisdoc/hevy-mcp/commit/187b93fb40c57e0827c89326ca9d01e660c608e9) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add `HEVY_MCP_TELEMETRY=0` to disable all Node project telemetry while preserving telemetry by default.

## 4.1.0

### Minor Changes

- [#758](https://github.com/chrisdoc/hevy-mcp/pull/758) [`f2b9bff`](https://github.com/chrisdoc/hevy-mcp/commit/f2b9bffbfe1c2fcc2a2f4fcf2a7b087849d49f67) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add opt-in Streamable HTTP transport to the Node package while preserving stdio as the default.

## 4.0.1

### Patch Changes

- [#756](https://github.com/chrisdoc/hevy-mcp/pull/756) [`90756f6`](https://github.com/chrisdoc/hevy-mcp/commit/90756f69d850619baa0ef391e8e4f9fca579dca9) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Include repository metadata in published package manifests for npm provenance validation.

## 4.0.0

### Major Changes

- [#715](https://github.com/chrisdoc/hevy-mcp/pull/715) [`36bfe38`](https://github.com/chrisdoc/hevy-mcp/commit/36bfe38ad89d1a52296b25cecc15c2d8310247db) Thanks [@chrisdoc](https://github.com/chrisdoc)! - The Node package now publishes a runtime-neutral MCP server behind
  `createNodeMcpServer({ apiKey })` and `runStdioServer()`. The default export,
  `createServer`, `runServer`, and `configSchema` are removed. Consumers that
  used the old programmatic API should pass the API key explicitly and choose
  whether their application owns a transport or uses the built-in stdio runner.

### Patch Changes

- [#732](https://github.com/chrisdoc/hevy-mcp/pull/732) [`6ea2a7a`](https://github.com/chrisdoc/hevy-mcp/commit/6ea2a7a6449300b34ba94964f3db932c95587c30) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Allow same-origin OAuth form submissions on the Worker.

- [#734](https://github.com/chrisdoc/hevy-mcp/pull/734) [`c7c0abc`](https://github.com/chrisdoc/hevy-mcp/commit/c7c0abce71328d8e9f7760285bb3fb078106d939) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Prefer Client ID Metadata Documents for Worker OAuth while retaining Dynamic Client Registration as a compatibility fallback.

- [#730](https://github.com/chrisdoc/hevy-mcp/pull/730) [`b52ad29`](https://github.com/chrisdoc/hevy-mcp/commit/b52ad29fd5515265951c16d836c3103cec664423) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Observe workout prompt failures safely and support prompt previews when routine arguments are omitted.

- [#732](https://github.com/chrisdoc/hevy-mcp/pull/732) [`6ea2a7a`](https://github.com/chrisdoc/hevy-mcp/commit/6ea2a7a6449300b34ba94964f3db932c95587c30) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Allow the legacy ChatGPT web origin to complete OAuth browser flows.

- [#727](https://github.com/chrisdoc/hevy-mcp/pull/727) [`1c95fe1`](https://github.com/chrisdoc/hevy-mcp/commit/1c95fe1ae0596737854a3cdd62d2a7347878a1a1) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Allow supported browser-based MCP clients to connect to the hosted Worker with exact-origin validation.

- [#736](https://github.com/chrisdoc/hevy-mcp/pull/736) [`01fc87b`](https://github.com/chrisdoc/hevy-mcp/commit/01fc87b6395c886c4b362b2858b26e948578d68e) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Allow sandboxed OAuth consent forms with an opaque browser origin to submit authorization safely.

- [#714](https://github.com/chrisdoc/hevy-mcp/pull/714) [`6c2e48c`](https://github.com/chrisdoc/hevy-mcp/commit/6c2e48ce3a0bc95fcc08b70c7d52cbfc71c96208) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Handle expected Hevy not-found responses consistently, preserve pagination metadata, and reduce telemetry noise from expected API and malformed-stdio failures.

- [#731](https://github.com/chrisdoc/hevy-mcp/pull/731) [`91cb2e5`](https://github.com/chrisdoc/hevy-mcp/commit/91cb2e59e59c983bde6fef8b8393bebbceb2fc7a) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Group MCP tool failure telemetry by sanitized error category and HTTP status while preserving per-event context tags.

- [#741](https://github.com/chrisdoc/hevy-mcp/pull/741) [`5afe15f`](https://github.com/chrisdoc/hevy-mcp/commit/5afe15fa008d914730f17ffd5a8bbec72a2ca65f) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add the `mcp.hevy-mcp.dev` custom domain to the Cloudflare Worker deployment.
