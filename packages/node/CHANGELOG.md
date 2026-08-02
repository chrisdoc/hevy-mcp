# hevy-mcp

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
