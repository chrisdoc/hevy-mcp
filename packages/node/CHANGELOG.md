# hevy-mcp

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
