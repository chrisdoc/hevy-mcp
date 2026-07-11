## 2.0.0

### Major Changes

- [#573](https://github.com/chrisdoc/hevy-mcp/pull/573) [`5660d40`](https://github.com/chrisdoc/hevy-mcp/commit/5660d4009202dc0f0c4d40a3e23ae8915d0668c2) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Change the public `createServer` factory to return a `Promise<McpServer>` so it
  can validate the configured Hevy API key before constructing a server. Reject
  confirmed authentication failures with a sanitized error, while warning with
  allowlisted diagnostics and continuing startup for other validation failures.

### Patch Changes

- [#574](https://github.com/chrisdoc/hevy-mcp/pull/574) [`0a26ed0`](https://github.com/chrisdoc/hevy-mcp/commit/0a26ed09f5fe536870412ece125deb4f07a38d86) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Expose MCP registry metadata through the package `mcpName` field and a synchronized `server.json` manifest.

- [#563](https://github.com/chrisdoc/hevy-mcp/pull/563) [`4c80e87`](https://github.com/chrisdoc/hevy-mcp/commit/4c80e87d8b6cbf82c11cd194d642a33bc1995980) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Provide MCP clients with concise server-level guidance for safe tool selection,
  recommended workout workflows, pagination, retries, and API-key setup.

- [#569](https://github.com/chrisdoc/hevy-mcp/pull/569) [`209a7d4`](https://github.com/chrisdoc/hevy-mcp/commit/209a7d45535de6da63d8e376bf7f230b0498cab7) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Print the CLI version with the package name to stderr.

- [#567](https://github.com/chrisdoc/hevy-mcp/pull/567) [`23cb9af`](https://github.com/chrisdoc/hevy-mcp/commit/23cb9af1c485afdbe2ce70188059ff3cf54f0b84) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Improve MCP tool descriptions with aliases, use-case guidance, side-effect classification, and operational constraints for more reliable LLM tool selection.

- [#594](https://github.com/chrisdoc/hevy-mcp/pull/594) [`6a5035a`](https://github.com/chrisdoc/hevy-mcp/commit/6a5035a89d134c7f10e60d163baaa2e957acb561) Thanks [@chrisdoc](https://github.com/chrisdoc)! - fix: format workout events to match MCP output schema

- [#575](https://github.com/chrisdoc/hevy-mcp/pull/575) [`fc4dd6f`](https://github.com/chrisdoc/hevy-mcp/commit/fc4dd6f934a0a7581b0d03464961618b154fa1d1) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Report privacy-safe malformed stdin diagnostics while continuing to process later MCP messages.

- [#570](https://github.com/chrisdoc/hevy-mcp/pull/570) [`d4b6872`](https://github.com/chrisdoc/hevy-mcp/commit/d4b6872bb9d0d5d1dd336b2baa14e9f05eaa5f00) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Gracefully close and flush the stdio transport on SIGINT or SIGTERM, with a
  bounded forced-exit fallback when shutdown stalls or other handles remain open.

- [#562](https://github.com/chrisdoc/hevy-mcp/pull/562) [`e29d5b7`](https://github.com/chrisdoc/hevy-mcp/commit/e29d5b793088788d771c0665986e61463442fd76) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Notify users on stderr about newer major releases or when they are more than
  two minor versions behind, using package-manager-neutral guidance.

- [#572](https://github.com/chrisdoc/hevy-mcp/pull/572) [`d1f629e`](https://github.com/chrisdoc/hevy-mcp/commit/d1f629ee2b2b5221d259676f453cbfb74242dbf3) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Add opt-in, privacy-bounded stderr diagnostics for tool invocations and Hevy API responses.

- [#568](https://github.com/chrisdoc/hevy-mcp/pull/568) [`a509594`](https://github.com/chrisdoc/hevy-mcp/commit/a5095940cdd3c0243a4d86f5ef75c58b3956b2d9) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Add an official Docker image and GHCR release packaging for stdio deployments.

- [#592](https://github.com/chrisdoc/hevy-mcp/pull/592) [`b9b6dce`](https://github.com/chrisdoc/hevy-mcp/commit/b9b6dce872c2c2088c9a18dd32ba3c06e49f9c3c) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Associate Hevy API trace spans with the current user when available.

## 1.28.1-beta.1

### Patch Changes

- [#594](https://github.com/chrisdoc/hevy-mcp/pull/594) [`6a5035a`](https://github.com/chrisdoc/hevy-mcp/commit/6a5035a89d134c7f10e60d163baaa2e957acb561) Thanks [@chrisdoc](https://github.com/chrisdoc)! - fix: format workout events to match MCP output schema

## 1.28.1-beta.0

### Patch Changes

- [#574](https://github.com/chrisdoc/hevy-mcp/pull/574) [`0a26ed0`](https://github.com/chrisdoc/hevy-mcp/commit/0a26ed09f5fe536870412ece125deb4f07a38d86) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Expose MCP registry metadata through the package `mcpName` field and a synchronized `server.json` manifest.

- [#563](https://github.com/chrisdoc/hevy-mcp/pull/563) [`4c80e87`](https://github.com/chrisdoc/hevy-mcp/commit/4c80e87d8b6cbf82c11cd194d642a33bc1995980) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Provide MCP clients with concise server-level guidance for safe tool selection,
  recommended workout workflows, pagination, retries, and API-key setup.

- [#569](https://github.com/chrisdoc/hevy-mcp/pull/569) [`209a7d4`](https://github.com/chrisdoc/hevy-mcp/commit/209a7d45535de6da63d8e376bf7f230b0498cab7) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Print the CLI version with the package name to stderr.

- [#567](https://github.com/chrisdoc/hevy-mcp/pull/567) [`23cb9af`](https://github.com/chrisdoc/hevy-mcp/commit/23cb9af1c485afdbe2ce70188059ff3cf54f0b84) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Improve MCP tool descriptions with aliases, use-case guidance, side-effect classification, and operational constraints for more reliable LLM tool selection.

- [#575](https://github.com/chrisdoc/hevy-mcp/pull/575) [`fc4dd6f`](https://github.com/chrisdoc/hevy-mcp/commit/fc4dd6f934a0a7581b0d03464961618b154fa1d1) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Report privacy-safe malformed stdin diagnostics while continuing to process later MCP messages.

- [#570](https://github.com/chrisdoc/hevy-mcp/pull/570) [`d4b6872`](https://github.com/chrisdoc/hevy-mcp/commit/d4b6872bb9d0d5d1dd336b2baa14e9f05eaa5f00) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Gracefully close and flush the stdio transport on SIGINT or SIGTERM, with a
  bounded forced-exit fallback when shutdown stalls or other handles remain open.

- [#562](https://github.com/chrisdoc/hevy-mcp/pull/562) [`e29d5b7`](https://github.com/chrisdoc/hevy-mcp/commit/e29d5b793088788d771c0665986e61463442fd76) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Notify users on stderr about newer major releases or when they are more than
  two minor versions behind, using package-manager-neutral guidance.

- [#572](https://github.com/chrisdoc/hevy-mcp/pull/572) [`d1f629e`](https://github.com/chrisdoc/hevy-mcp/commit/d1f629ee2b2b5221d259676f453cbfb74242dbf3) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Add opt-in, privacy-bounded stderr diagnostics for tool invocations and Hevy API responses.

## 1.28.0

### Minor Changes

- [#510](https://github.com/chrisdoc/hevy-mcp/pull/510) [`caf294d`](https://github.com/chrisdoc/hevy-mcp/commit/caf294d8f353a53cffc85d95d9919a56b2cf72f9) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Send structured MCP client logs for Hevy API retries, rate limits, errors, and exercise template catalog refreshes.

- [#508](https://github.com/chrisdoc/hevy-mcp/pull/508) [`b5ffe99`](https://github.com/chrisdoc/hevy-mcp/commit/b5ffe99c098b99f47f183de69b5f33b058ac3e35) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Add guided MCP prompts for analyzing workout progress and creating a completed workout from a routine.

## 1.27.0

### Minor Changes

- [#512](https://github.com/chrisdoc/hevy-mcp/pull/512) [`0a592d7`](https://github.com/chrisdoc/hevy-mcp/commit/0a592d7e284c469949f1545b3bf26612d34b0aea) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Add validated structured output schemas and `structuredContent` to all read-only tools while preserving their existing text responses.

### Patch Changes

- [#504](https://github.com/chrisdoc/hevy-mcp/pull/504) [`bae0ffb`](https://github.com/chrisdoc/hevy-mcp/commit/bae0ffbf170a7ac5584b29d909268bca36fdde16) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Correct the MCP registration span tool count to reflect successful tool registrations.

- [#509](https://github.com/chrisdoc/hevy-mcp/pull/509) [`fb00d27`](https://github.com/chrisdoc/hevy-mcp/commit/fb00d27cf4709e4d08833eb63d5543783a0053c9) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Expose the user profile, workout count, exercise template catalog, and routine
  folders as discoverable MCP resources.

## 1.26.6

### Patch Changes

- [#493](https://github.com/chrisdoc/hevy-mcp/pull/493) [`d36658e`](https://github.com/chrisdoc/hevy-mcp/commit/d36658e410b098c4a7f8db97b0b20371d4f7d4d4) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add enhanced OpenTelemetry and Sentry instrumentation and observability to MCP tool calls, capturing safe whitelisted arguments, response payload metadata (content count and text length), detailed error properties (code, message, type), and grouping execution duration by success/error status.

## 1.26.5

### Patch Changes

- [#491](https://github.com/chrisdoc/hevy-mcp/pull/491) [`2d22bd2`](https://github.com/chrisdoc/hevy-mcp/commit/2d22bd21f1d726777d77efff4163ebb33a2fc947) Thanks [@chrisdoc](https://github.com/chrisdoc)! - change nodejs engine to 20

## 1.26.4

### Patch Changes

- [#488](https://github.com/chrisdoc/hevy-mcp/pull/488) [`161adc7`](https://github.com/chrisdoc/hevy-mcp/commit/161adc704179a0e3a47493d5d3b7f7c46b7c15c9) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Added integration tests covering the workout detail endpoints: `get-workout`, `get-workout-count`, and `get-workout-events`. These tools were not exercised by the existing mocked integration test suite.

## 1.26.3

### Patch Changes

- [#421](https://github.com/chrisdoc/hevy-mcp/pull/421) [`2c1fa0d`](https://github.com/chrisdoc/hevy-mcp/commit/2c1fa0df05341a038c1bdeba062addcadabb5ed2) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Lower the minimum supported Node.js version to 24 (current Active LTS) and
  update CI to test against Node 24.x and 26.x. Update README quick start and
  prerequisites to match the supported runtime versions.

## 1.26.2

### Patch Changes

- [#425](https://github.com/chrisdoc/hevy-mcp/pull/425) [`958b037`](https://github.com/chrisdoc/hevy-mcp/commit/958b0373a1bafa91be505689fdbea981a68308c4) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Add resilient Hevy API request handling with configurable timeout,
  bounded retries for transient GET failures, Retry-After support for
  429 responses, and clearer user-facing rate-limit/transient error
  messages.

- [#381](https://github.com/chrisdoc/hevy-mcp/pull/381) [`058a163`](https://github.com/chrisdoc/hevy-mcp/commit/058a163502e94385f8a481c5725531eaacd30884) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Add `ignoreErrors: ["EPIPE", "broken pipe"]` to the Sentry config so
  abrupt stdio client disconnects do not generate noisy Sentry events.

## 1.26.1

### Patch Changes

- [#438](https://github.com/chrisdoc/hevy-mcp/pull/438) [`35ab9ea`](https://github.com/chrisdoc/hevy-mcp/commit/35ab9eaa98bbe7ebbaf1b9832ee8d7e183851073) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Align MCP tool response helpers with SDK `CallToolResult` typing by
  replacing the loose custom response interface, narrowing helper content to
  SDK `TextContent[]`, and ensuring JSON responses always emit string text.

- [#436](https://github.com/chrisdoc/hevy-mcp/pull/436) [`f1b6018`](https://github.com/chrisdoc/hevy-mcp/commit/f1b601801ab5d8d8c8948d1cc102606781736fc7) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Add a shared bounded TTL async cache utility and migrate exercise template
  catalog caching in `search-exercise-templates` to use it. This keeps cache
  behavior consistent (TTL, LRU bound, refresh invalidation, and in-flight
  request de-duplication) and adds tests plus README documentation.

- [#463](https://github.com/chrisdoc/hevy-mcp/pull/463) [`d5df6ca`](https://github.com/chrisdoc/hevy-mcp/commit/d5df6cac5db50fe0dbe6feadb0268e6d434604e5) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Fix commitlint failing on Mergify batch merge commits in the merge queue.

- [#434](https://github.com/chrisdoc/hevy-mcp/pull/434) [`59f95fe`](https://github.com/chrisdoc/hevy-mcp/commit/59f95fe448bcb5cd38f253e62ae69439ece8762b) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Deprecate CLI API key arguments by warning on stderr whenever
  `--hevy-api-key=...`, `--hevyApiKey=...`, or `hevy-api-key=...` is used.
  Keep backward compatibility for those flags while documenting `HEVY_API_KEY`
  as the recommended and secure configuration path.

- [#474](https://github.com/chrisdoc/hevy-mcp/pull/474) [`12cf700`](https://github.com/chrisdoc/hevy-mcp/commit/12cf70079ad52819820509fa7a2e3337e7e6c73a) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Fix missing OTEL_COLLECTOR_TOKEN in the Release workflow build step.

  The Release workflow built the npm package without passing the
  OTEL_COLLECTOR_TOKEN secret, so the published package had an empty
  collector token. This caused the OTLP exporter to be skipped at
  runtime (the `if (collectorToken)` guard in telemetry.ts), meaning
  no traces or metrics were sent to the OTel Collector.

- [#439](https://github.com/chrisdoc/hevy-mcp/pull/439) [`ca182f6`](https://github.com/chrisdoc/hevy-mcp/commit/ca182f60c6aa0aa24d75f3f5a74559f123d066b9) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Add mocked integration coverage with nock and run mocked integrations on every
  PR while keeping live integrations optional behind `HEVY_API_KEY`.

- [#431](https://github.com/chrisdoc/hevy-mcp/pull/431) [`b6fe3c0`](https://github.com/chrisdoc/hevy-mcp/commit/b6fe3c0749c9297123c05fde10c2640743cbbdd8) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Add CLI `--help`/`-h` and `--version`/`-v` flags that print output and
  exit before server startup, with unit test coverage for flag and default
  startup behavior.

- [#423](https://github.com/chrisdoc/hevy-mcp/pull/423) [`8dfb593`](https://github.com/chrisdoc/hevy-mcp/commit/8dfb59326202bd0473bfeb3c26c413b6f8475cb4) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Map common Hevy API error statuses to clearer MCP error messages and keep
  structured debug context with original HTTP details for troubleshooting.

## 1.26.0

### Minor Changes

- [#443](https://github.com/chrisdoc/hevy-mcp/pull/443) [`178a1f9`](https://github.com/chrisdoc/hevy-mcp/commit/178a1f9a39f4326d3aed96ebb25606cf7ecf516f) Thanks [@chrisdoc](https://github.com/chrisdoc)! - Add OpenTelemetry instrumentation with dual export to Sentry and an
  OTel Collector (forwarding to Honeycomb and other backends).

  - New `src/utils/telemetry.ts` initializes OpenTelemetry with a custom
    tracer provider that has dual span processors: `SentrySpanProcessor`
    for Sentry (errors + traces) and `BatchSpanProcessor` with
    `OTLPTraceExporter` routed through our own OTel Collector, which
    forwards traces and metrics to Honeycomb and other backends.
  - New `src/utils/metrics.ts` defines metric instruments (counters and
    histograms) for tool invocations, errors, duration, API calls, API
    latency, stdio parse errors, and server startups.
  - Migrated all `Sentry.startSpan()` calls to the OpenTelemetry API
    (`tracer.startActiveSpan()`) for vendor-neutral span creation.
    Spans are still exported to Sentry via the `SentrySpanProcessor`.
  - Added axios interceptors to `hevyClientKubb.ts` for automatic HTTP
    tracing and metrics recording on every Hevy API call.
  - The collector endpoint and auth token are injected at build time
    from the `OTEL_COLLECTOR_ENDPOINT` and `OTEL_COLLECTOR_TOKEN`
    GitHub secrets via `tsdown.config.ts` define. Traces and metrics
    are sent to the OTel Collector, which forwards them to Honeycomb
    and other observability backends.
  - Sentry remains the error monitoring backend (captureException,
    setUser, withScope, wrapMcpServerWithSentry).

## 1.25.17

### Patch Changes

- [#393](https://github.com/chrisdoc/hevy-mcp/pull/393) [`a1ddf76`](https://github.com/chrisdoc/hevy-mcp/commit/a1ddf76c8a2c9c315920e52bebbbf40a1a355223) Thanks [@charliecreates](https://github.com/apps/charliecreates)! - Fix exercise template catalog caching so a failed in-flight fetch is not
  reused as a rejected promise and subsequent searches retry naturally.

### Bug Fixes

- preserve routine supersetId in read responses ([#375](https://github.com/chrisdoc/hevy-mcp/issues/375)) ([9291ace](https://github.com/chrisdoc/hevy-mcp/commit/9291acec0cba10bc79771b7b995de31af919e593))

## [1.25.16](https://github.com/chrisdoc/hevy-mcp/compare/v1.25.15...v1.25.16) (2026-07-02)

## [1.25.15](https://github.com/chrisdoc/hevy-mcp/compare/v1.25.14...v1.25.15) (2026-06-29)

## [1.25.14](https://github.com/chrisdoc/hevy-mcp/compare/v1.25.13...v1.25.14) (2026-06-29)

## [1.25.13](https://github.com/chrisdoc/hevy-mcp/compare/v1.25.12...v1.25.13) (2026-06-29)

## [1.25.12](https://github.com/chrisdoc/hevy-mcp/compare/v1.25.11...v1.25.12) (2026-06-24)

## [1.25.11](https://github.com/chrisdoc/hevy-mcp/compare/v1.25.10...v1.25.11) (2026-06-23)

## [1.25.10](https://github.com/chrisdoc/hevy-mcp/compare/v1.25.9...v1.25.10) (2026-06-23)

## [1.25.9](https://github.com/chrisdoc/hevy-mcp/compare/v1.25.8...v1.25.9) (2026-06-23)

## [1.25.8](https://github.com/chrisdoc/hevy-mcp/compare/v1.25.7...v1.25.8) (2026-06-23)

## [1.25.7](https://github.com/chrisdoc/hevy-mcp/compare/v1.25.6...v1.25.7) (2026-06-23)

## [1.25.6](https://github.com/chrisdoc/hevy-mcp/compare/v1.25.5...v1.25.6) (2026-06-23)

## [1.25.5](https://github.com/chrisdoc/hevy-mcp/compare/v1.25.4...v1.25.5) (2026-06-19)

## [1.25.4](https://github.com/chrisdoc/hevy-mcp/compare/v1.25.3...v1.25.4) (2026-06-19)

### Bug Fixes

- remove kubb plugin-client from runtime deps ([#356](https://github.com/chrisdoc/hevy-mcp/issues/356)) ([61077ae](https://github.com/chrisdoc/hevy-mcp/commit/61077ae7942168ef79baf7b8c8454e1dcc2760c7))

## [1.25.3](https://github.com/chrisdoc/hevy-mcp/compare/v1.25.2...v1.25.3) (2026-06-17)

## [1.25.2](https://github.com/chrisdoc/hevy-mcp/compare/v1.25.1...v1.25.2) (2026-06-17)

## [1.25.1](https://github.com/chrisdoc/hevy-mcp/compare/v1.25.0...v1.25.1) (2026-06-17)

# [1.25.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.24.2...v1.25.0) (2026-06-16)

### Features

- add MCP lifecycle and stdio parse observability ([#348](https://github.com/chrisdoc/hevy-mcp/issues/348)) ([f7a816b](https://github.com/chrisdoc/hevy-mcp/commit/f7a816baf8c852b7f891b4575fa49dced3806511))

## [1.24.2](https://github.com/chrisdoc/hevy-mcp/compare/v1.24.1...v1.24.2) (2026-06-15)

### Bug Fixes

- align sentry release name with project@version pattern ([fa9613f](https://github.com/chrisdoc/hevy-mcp/commit/fa9613f95d6ff6786b354f93e00d310b36c575e6))

## [1.24.1](https://github.com/chrisdoc/hevy-mcp/compare/v1.24.0...v1.24.1) (2026-06-15)

# [1.24.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.24...v1.24.0) (2026-06-15)

### Features

- fix sentry ([728d9a0](https://github.com/chrisdoc/hevy-mcp/commit/728d9a0da6f7fabd8baa468d36e528bb43a5ed2e))

## [1.23.24](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.23...v1.23.24) (2026-06-15)

## [1.23.23](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.22...v1.23.23) (2026-06-13)

## [1.23.22](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.21...v1.23.22) (2026-06-10)

## [1.23.21](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.20...v1.23.21) (2026-06-09)

## [1.23.20](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.19...v1.23.20) (2026-06-09)

## [1.23.19](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.18...v1.23.19) (2026-06-09)

## [1.23.18](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.17...v1.23.18) (2026-06-04)

## [1.23.17](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.16...v1.23.17) (2026-06-04)

## [1.23.16](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.15...v1.23.16) (2026-06-03)

## [1.23.15](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.14...v1.23.15) (2026-06-03)

## [1.23.14](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.13...v1.23.14) (2026-06-01)

### Bug Fixes

- keep MCP stdio clean on routine update errors ([#330](https://github.com/chrisdoc/hevy-mcp/issues/330)) ([540c5eb](https://github.com/chrisdoc/hevy-mcp/commit/540c5eb1c2a4a948a5ae4309880532107fdeba8e))

## [1.23.13](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.12...v1.23.13) (2026-05-23)

## [1.23.12](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.11...v1.23.12) (2026-05-19)

## [1.23.11](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.10...v1.23.11) (2026-05-19)

## [1.23.10](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.9...v1.23.10) (2026-05-12)

## [1.23.9](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.8...v1.23.9) (2026-05-12)

## [1.23.8](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.7...v1.23.8) (2026-05-09)

## [1.23.7](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.6...v1.23.7) (2026-05-08)

## [1.23.6](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.5...v1.23.6) (2026-05-05)

## [1.23.5](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.4...v1.23.5) (2026-05-05)

## [1.23.4](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.3...v1.23.4) (2026-05-05)

## [1.23.3](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.2...v1.23.3) (2026-04-28)

## [1.23.2](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.1...v1.23.2) (2026-04-28)

## [1.23.1](https://github.com/chrisdoc/hevy-mcp/compare/v1.23.0...v1.23.1) (2026-04-28)

# [1.23.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.22.0...v1.23.0) (2026-04-23)

### Features

- add body measurements MCP tools ([#306](https://github.com/chrisdoc/hevy-mcp/issues/306)) ([78b3a5b](https://github.com/chrisdoc/hevy-mcp/commit/78b3a5b7dc87648e5de15ce8229468bc094a618d))

# [1.22.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.20...v1.22.0) (2026-04-23)

### Features

- update openapi spec and regenerate api client ([#305](https://github.com/chrisdoc/hevy-mcp/issues/305)) ([0bfad15](https://github.com/chrisdoc/hevy-mcp/commit/0bfad15b5897e57c08eb63aebf65bd91bbad8ef2))

## [1.21.20](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.19...v1.21.20) (2026-04-21)

## [1.21.19](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.18...v1.21.19) (2026-04-21)

## [1.21.18](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.17...v1.21.18) (2026-04-16)

## [1.21.17](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.16...v1.21.17) (2026-04-14)

## [1.21.16](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.15...v1.21.16) (2026-04-14)

## [1.21.15](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.14...v1.21.15) (2026-04-14)

## [1.21.14](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.13...v1.21.14) (2026-04-12)

## [1.21.13](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.12...v1.21.13) (2026-04-08)

## [1.21.12](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.11...v1.21.12) (2026-04-08)

## [1.21.11](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.10...v1.21.11) (2026-04-07)

## [1.21.10](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.9...v1.21.10) (2026-04-06)

## [1.21.9](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.8...v1.21.9) (2026-04-06)

## [1.21.8](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.7...v1.21.8) (2026-04-05)

### Bug Fixes

- format README.md and add .md to lefthook check ([1369ef5](https://github.com/chrisdoc/hevy-mcp/commit/1369ef5276ad6c4833e2b19e3ddfd248ff3a7cd1))

## [1.21.7](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.6...v1.21.7) (2026-04-05)

## [1.21.6](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.5...v1.21.6) (2026-04-05)

## [1.21.5](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.4...v1.21.5) (2026-04-05)

## [1.21.4](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.3...v1.21.4) (2026-04-05)

## [1.21.3](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.2...v1.21.3) (2026-04-05)

## [1.21.2](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.1...v1.21.2) (2026-03-30)

## [1.21.1](https://github.com/chrisdoc/hevy-mcp/compare/v1.21.0...v1.21.1) (2026-03-23)

# [1.21.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.20.10...v1.21.0) (2026-03-15)

### Features

- add search-exercise-templates tool with in-memory cache ([#281](https://github.com/chrisdoc/hevy-mcp/issues/281)) ([5aba482](https://github.com/chrisdoc/hevy-mcp/commit/5aba4821622bf73dc41eaad074d024610ec9584a))

## [1.20.10](https://github.com/chrisdoc/hevy-mcp/compare/v1.20.9...v1.20.10) (2026-03-10)

## [1.20.9](https://github.com/chrisdoc/hevy-mcp/compare/v1.20.8...v1.20.9) (2026-03-09)

## [1.20.8](https://github.com/chrisdoc/hevy-mcp/compare/v1.20.7...v1.20.8) (2026-03-04)

## [1.20.7](https://github.com/chrisdoc/hevy-mcp/compare/v1.20.6...v1.20.7) (2026-03-02)

## [1.20.6](https://github.com/chrisdoc/hevy-mcp/compare/v1.20.5...v1.20.6) (2026-02-24)

### Bug Fixes

- **routines:** keep reps when repRange is set ([#270](https://github.com/chrisdoc/hevy-mcp/issues/270)) ([48da995](https://github.com/chrisdoc/hevy-mcp/commit/48da9951ad0be80b0fe7da2d02356ca890abcfdf))

## [1.20.5](https://github.com/chrisdoc/hevy-mcp/compare/v1.20.4...v1.20.5) (2026-02-19)

### Bug Fixes

- trigger new release ([88e1989](https://github.com/chrisdoc/hevy-mcp/commit/88e1989650f0b2074ac597ccf449648e877c9ae8))

## [1.20.3](https://github.com/chrisdoc/hevy-mcp/compare/v1.20.2...v1.20.3) (2026-02-16)

## [1.20.2](https://github.com/chrisdoc/hevy-mcp/compare/v1.20.1...v1.20.2) (2026-02-16)

## [1.20.1](https://github.com/chrisdoc/hevy-mcp/compare/v1.20.0...v1.20.1) (2026-02-10)

### Bug Fixes

- release 1.20 ([b9826d4](https://github.com/chrisdoc/hevy-mcp/commit/b9826d464780991945e14a7376fca60d388c66bc))

## [1.19.21](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.20...v1.19.21) (2026-02-09)

## [1.19.20](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.19...v1.19.20) (2026-02-09)

## [1.19.19](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.18...v1.19.19) (2026-02-09)

## [1.19.18](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.17...v1.19.18) (2026-02-04)

## [1.19.17](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.16...v1.19.17) (2026-02-04)

## [1.19.16](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.15...v1.19.16) (2026-02-03)

### Bug Fixes

- **copilot:** Sync Copilot instructions with current codebase state ([#250](https://github.com/chrisdoc/hevy-mcp/issues/250)) ([27734a9](https://github.com/chrisdoc/hevy-mcp/commit/27734a92315297e85a5df590d5d0c664c784ad4c))

## [1.19.15](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.14...v1.19.15) (2026-02-02)

## [1.19.14](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.13...v1.19.14) (2026-02-02)

## [1.19.13](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.12...v1.19.13) (2026-02-02)

## [1.19.12](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.11...v1.19.12) (2026-01-30)

## [1.19.11](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.10...v1.19.11) (2026-01-30)

## [1.19.10](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.9...v1.19.10) (2026-01-30)

## [1.19.9](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.8...v1.19.9) (2026-01-30)

## [1.19.8](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.7...v1.19.8) (2026-01-27)

## [1.19.7](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.6...v1.19.7) (2026-01-26)

## [1.19.6](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.5...v1.19.6) (2026-01-26)

## [1.19.5](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.4...v1.19.5) (2026-01-19)

## [1.19.4](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.3...v1.19.4) (2026-01-19)

## [1.19.3](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.2...v1.19.3) (2026-01-19)

## [1.19.2](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.1...v1.19.2) (2026-01-12)

## [1.19.1](https://github.com/chrisdoc/hevy-mcp/compare/v1.19.0...v1.19.1) (2026-01-12)

# [1.19.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.18.11...v1.19.0) (2026-01-08)

### Features

- **client:** export HevyApiClient type for external type annotations ([f3530d3](https://github.com/chrisdoc/hevy-mcp/commit/f3530d31d09c8a1cc4b27b71158afcf865eb5604))

## [1.18.11](https://github.com/chrisdoc/hevy-mcp/compare/v1.18.10...v1.18.11) (2026-01-08)

### Bug Fixes

- **workouts:** omit routine_id from create/update ([#229](https://github.com/chrisdoc/hevy-mcp/issues/229)) ([bca641a](https://github.com/chrisdoc/hevy-mcp/commit/bca641a2efb6008389630501b2a6c926ca7b76c6))

## [1.18.10](https://github.com/chrisdoc/hevy-mcp/compare/v1.18.9...v1.18.10) (2026-01-08)

### Bug Fixes

- extract axios response data for better error messages ([#233](https://github.com/chrisdoc/hevy-mcp/issues/233)) ([6ba1dbc](https://github.com/chrisdoc/hevy-mcp/commit/6ba1dbcf5d24b8a5b653a852e5b23b541a2b8a65))

## [1.18.9](https://github.com/chrisdoc/hevy-mcp/compare/v1.18.8...v1.18.9) (2026-01-08)

## [1.18.8](https://github.com/chrisdoc/hevy-mcp/compare/v1.18.7...v1.18.8) (2026-01-07)

## [1.18.7](https://github.com/chrisdoc/hevy-mcp/compare/v1.18.6...v1.18.7) (2026-01-05)

## [1.18.6](https://github.com/chrisdoc/hevy-mcp/compare/v1.18.5...v1.18.6) (2026-01-05)

## [1.18.5](https://github.com/chrisdoc/hevy-mcp/compare/v1.18.4...v1.18.5) (2025-12-29)

## [1.18.4](https://github.com/chrisdoc/hevy-mcp/compare/v1.18.3...v1.18.4) (2025-12-29)

## [1.18.3](https://github.com/chrisdoc/hevy-mcp/compare/v1.18.2...v1.18.3) (2025-12-28)

## [1.18.2](https://github.com/chrisdoc/hevy-mcp/compare/v1.18.1...v1.18.2) (2025-12-25)

## [1.18.1](https://github.com/chrisdoc/hevy-mcp/compare/v1.18.0...v1.18.1) (2025-12-24)

# [1.18.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.17.3...v1.18.0) (2025-12-23)

### Features

- integrate Sentry Rollup plugin for source map uploads ([#215](https://github.com/chrisdoc/hevy-mcp/issues/215)) ([c1195c1](https://github.com/chrisdoc/hevy-mcp/commit/c1195c11288698df2d9e190bd92c5f0e014179d8))

### BREAKING CHANGES

- **HTTP/SSE transport removed**: hevy-mcp now runs exclusively over stdio.

  For migration steps (including Cursor config examples), see:
  https://github.com/chrisdoc/hevy-mcp#migration-from-httpsse-transport

## [1.17.3](https://github.com/chrisdoc/hevy-mcp/compare/v1.17.2...v1.17.3) (2025-12-23)

## [1.17.2](https://github.com/chrisdoc/hevy-mcp/compare/v1.17.1...v1.17.2) (2025-12-23)

## [1.17.1](https://github.com/chrisdoc/hevy-mcp/compare/v1.17.0...v1.17.1) (2025-12-22)

# [1.17.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.16.0...v1.17.0) (2025-12-20)

### Features

- **sentry:** add release tracking ([#204](https://github.com/chrisdoc/hevy-mcp/issues/204)) ([123b17c](https://github.com/chrisdoc/hevy-mcp/commit/123b17c11cb65bfc11844df822d5c7d56c05873e))

# [1.16.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.15.0...v1.16.0) (2025-12-19)

### Features

- **mcp:** add new tools for exercise history and template creation ([7b5e71d](https://github.com/chrisdoc/hevy-mcp/commit/7b5e71df9361e4e7a0ade11f4f01a6ba2291c78a))

# [1.15.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.14.4...v1.15.0) (2025-12-19)

### Features

- **api:** add support for rep ranges ([00c9e6b](https://github.com/chrisdoc/hevy-mcp/commit/00c9e6b83b81a8df464075b3f98c7e76f37f1c86))

## [1.14.4](https://github.com/chrisdoc/hevy-mcp/compare/v1.14.3...v1.14.4) (2025-12-16)

## [1.14.3](https://github.com/chrisdoc/hevy-mcp/compare/v1.14.2...v1.14.3) (2025-12-15)

## [1.14.2](https://github.com/chrisdoc/hevy-mcp/compare/v1.14.1...v1.14.2) (2025-12-15)

## [1.14.1](https://github.com/chrisdoc/hevy-mcp/compare/v1.14.0...v1.14.1) (2025-12-15)

# [1.14.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.13.2...v1.14.0) (2025-12-10)

### Features

- integrate Sentry monitoring ([#196](https://github.com/chrisdoc/hevy-mcp/issues/196)) ([4ea9b31](https://github.com/chrisdoc/hevy-mcp/commit/4ea9b31b34225544eaefb5622fb18bdb0b944970))

## [1.13.2](https://github.com/chrisdoc/hevy-mcp/compare/v1.13.1...v1.13.2) (2025-12-10)

### Bug Fixes

- align routine and workout weight fields ([#190](https://github.com/chrisdoc/hevy-mcp/issues/190)) ([14d10d1](https://github.com/chrisdoc/hevy-mcp/commit/14d10d1a074e1a52830d69e42734c4f5a3eb4dfd))

## [1.13.1](https://github.com/chrisdoc/hevy-mcp/compare/v1.13.0...v1.13.1) (2025-12-10)

# [1.13.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.24...v1.13.0) (2025-12-10)

### Features

- improve type safety with Zod schema inference ([f78f35b](https://github.com/chrisdoc/hevy-mcp/commit/f78f35bfcb500b07c3d32365a537f680482d98c3))

## [1.12.24](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.23...v1.12.24) (2025-12-09)

## [1.12.23](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.22...v1.12.23) (2025-12-09)

### Bug Fixes

- **nightly:** revert to global install - npx PATH issues are unfixable ([de37575](https://github.com/chrisdoc/hevy-mcp/commit/de37575004e866816b2fc2860f9513f7e36628e6))

## [1.12.22](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.21...v1.12.22) (2025-12-09)

## [1.12.21](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.20...v1.12.21) (2025-12-09)

## [1.12.20](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.19...v1.12.20) (2025-12-09)

### Bug Fixes

- **nightly:** use global install - npx has issues in CI ([f6a721f](https://github.com/chrisdoc/hevy-mcp/commit/f6a721f4666b76c86cef9bda6e4a9158b32fee2d))

## [1.12.19](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.18...v1.12.19) (2025-12-09)

## [1.12.18](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.17...v1.12.18) (2025-12-09)

### Bug Fixes

- **nightly:** install hevy-mcp globally before running test ([08ff5db](https://github.com/chrisdoc/hevy-mcp/commit/08ff5dba63fe08e2c8fee1e4d041634f628b7498))

## [1.12.17](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.16...v1.12.17) (2025-12-09)

### Bug Fixes

- add trailing newline to .npmrc for Smithery compatibility ([ee50888](https://github.com/chrisdoc/hevy-mcp/commit/ee508888d1f8b332a47d6810fcb1b31d12cbaf49))

## [1.12.16](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.15...v1.12.16) (2025-12-08)

## [1.12.15](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.14...v1.12.15) (2025-12-08)

## [1.12.14](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.13...v1.12.14) (2025-12-08)

## [1.12.13](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.12...v1.12.13) (2025-12-05)

### Bug Fixes

- make hevy-mcp CLI start stdio server again ([#184](https://github.com/chrisdoc/hevy-mcp/issues/184)) ([3fd898a](https://github.com/chrisdoc/hevy-mcp/commit/3fd898a6d02ce03699df7a9097a8c670a259370f))

## [1.12.12](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.11...v1.12.12) (2025-12-02)

## [1.12.11](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.10...v1.12.11) (2025-12-01)

## [1.12.10](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.9...v1.12.10) (2025-12-01)

## [1.12.9](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.8...v1.12.9) (2025-11-29)

## [1.12.8](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.7...v1.12.8) (2025-11-29)

### Bug Fixes

- remove stdout pollution in stdio mode ([#174](https://github.com/chrisdoc/hevy-mcp/issues/174)) ([0ad6a1b](https://github.com/chrisdoc/hevy-mcp/commit/0ad6a1bd2024b1f6223bd5d1dba522d239effa29))

## [1.12.7](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.6...v1.12.7) (2025-11-29)

## [1.12.6](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.5...v1.12.6) (2025-11-29)

## [1.12.5](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.4...v1.12.5) (2025-11-24)

## [1.12.4](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.3...v1.12.4) (2025-11-24)

## [1.12.3](https://github.com/chrisdoc/hevy-mcp/compare/v1.12.2...v1.12.3) (2025-11-24)

## [1.11.10](https://github.com/chrisdoc/hevy-mcp/compare/v1.11.9...v1.11.10) (2025-11-18)

## [1.10.16](https://github.com/chrisdoc/hevy-mcp/compare/v1.10.15...v1.10.16) (2025-11-16)

## [1.10.15](https://github.com/chrisdoc/hevy-mcp/compare/v1.10.14...v1.10.15) (2025-11-10)

## [1.10.14](https://github.com/chrisdoc/hevy-mcp/compare/v1.10.13...v1.10.14) (2025-11-10)

## [1.10.13](https://github.com/chrisdoc/hevy-mcp/compare/v1.10.12...v1.10.13) (2025-11-10)

## [1.10.12](https://github.com/chrisdoc/hevy-mcp/compare/v1.10.11...v1.10.12) (2025-11-03)

## [1.10.11](https://github.com/chrisdoc/hevy-mcp/compare/v1.10.10...v1.10.11) (2025-10-20)

## [1.10.10](https://github.com/chrisdoc/hevy-mcp/compare/v1.10.9...v1.10.10) (2025-10-20)

## [1.10.9](https://github.com/chrisdoc/hevy-mcp/compare/v1.10.8...v1.10.9) (2025-10-20)

## [1.10.8](https://github.com/chrisdoc/hevy-mcp/compare/v1.10.7...v1.10.8) (2025-10-20)

## [1.10.7](https://github.com/chrisdoc/hevy-mcp/compare/v1.10.6...v1.10.7) (2025-10-13)

## [1.10.6](https://github.com/chrisdoc/hevy-mcp/compare/v1.10.5...v1.10.6) (2025-10-06)

## [1.10.5](https://github.com/chrisdoc/hevy-mcp/compare/v1.10.4...v1.10.5) (2025-09-29)

## [1.10.4](https://github.com/chrisdoc/hevy-mcp/compare/v1.10.3...v1.10.4) (2025-09-22)

## [1.10.3](https://github.com/chrisdoc/hevy-mcp/compare/v1.10.2...v1.10.3) (2025-09-22)

## [1.10.2](https://github.com/chrisdoc/hevy-mcp/compare/v1.10.1...v1.10.2) (2025-09-22)

## [1.10.1](https://github.com/chrisdoc/hevy-mcp/compare/v1.10.0...v1.10.1) (2025-09-18)

### Bug Fixes

- **smithery:** fix smithery.yaml ([e70244f](https://github.com/chrisdoc/hevy-mcp/commit/e70244fd55a55356f043df7d09d43ddea2e807ec))

# [1.10.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.9.3...v1.10.0) (2025-09-18)

### Features

- **arguments:** add possibility to provide key as argument ([91948a7](https://github.com/chrisdoc/hevy-mcp/commit/91948a7f032886cb22c368e73791e1c5181c3f22))

## [1.9.3](https://github.com/chrisdoc/hevy-mcp/compare/v1.9.2...v1.9.3) (2025-09-18)

### Bug Fixes

- **dockfile:** cmd ([3e40c0d](https://github.com/chrisdoc/hevy-mcp/commit/3e40c0de4e0e5bfaf34973f2bcad443839715848))

## [1.9.2](https://github.com/chrisdoc/hevy-mcp/compare/v1.9.1...v1.9.2) (2025-09-18)

### Bug Fixes

- **dockerfile:** start command ([f86052b](https://github.com/chrisdoc/hevy-mcp/commit/f86052baee21c8d4b578e9fef0bdfda1a55dad03))

## [1.9.1](https://github.com/chrisdoc/hevy-mcp/compare/v1.9.0...v1.9.1) (2025-09-18)

### Bug Fixes

- **docker:** fix dockerfile for smithery ([903e0e0](https://github.com/chrisdoc/hevy-mcp/commit/903e0e0adbbbb5a5f8f323fd67246c2c930395c9))

# [1.9.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.8.10...v1.9.0) (2025-09-18)

### Bug Fixes

- **docekr:** fix docker image ([a6416a3](https://github.com/chrisdoc/hevy-mcp/commit/a6416a38934c95409366f63feea9687cbb55c1f1))
- **misc:** fix package.json parsing ([00cb197](https://github.com/chrisdoc/hevy-mcp/commit/00cb19729bc2e7ed42160d55a73a70f5316436ae))
- **plan:** remove plan ([86263e4](https://github.com/chrisdoc/hevy-mcp/commit/86263e44442c53edfd28dfc62cc5b84665fe4b31))

### Features

- add Docker image building to CI/CD workflows ([#124](https://github.com/chrisdoc/hevy-mcp/issues/124)) ([760963e](https://github.com/chrisdoc/hevy-mcp/commit/760963e0fad219c8f80b9b259911a0573637558b))

## [1.8.10](https://github.com/chrisdoc/hevy-mcp/compare/v1.8.9...v1.8.10) (2025-09-17)

## [1.8.9](https://github.com/chrisdoc/hevy-mcp/compare/v1.8.8...v1.8.9) (2025-09-17)

## [1.8.8](https://github.com/chrisdoc/hevy-mcp/compare/v1.8.7...v1.8.8) (2025-09-15)

## [1.8.7](https://github.com/chrisdoc/hevy-mcp/compare/v1.8.6...v1.8.7) (2025-09-15)

## [1.8.6](https://github.com/chrisdoc/hevy-mcp/compare/v1.8.5...v1.8.6) (2025-09-15)

## [1.8.5](https://github.com/chrisdoc/hevy-mcp/compare/v1.8.4...v1.8.5) (2025-09-11)

## [1.8.4](https://github.com/chrisdoc/hevy-mcp/compare/v1.8.3...v1.8.4) (2025-09-08)

## [1.8.3](https://github.com/chrisdoc/hevy-mcp/compare/v1.8.2...v1.8.3) (2025-09-08)

## [1.8.2](https://github.com/chrisdoc/hevy-mcp/compare/v1.8.1...v1.8.2) (2025-09-08)

## [1.8.1](https://github.com/chrisdoc/hevy-mcp/compare/v1.8.0...v1.8.1) (2025-09-04)

# [1.8.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.7.16...v1.8.0) (2025-08-26)

### Bug Fixes

- **tests:** fix integration tests accessing wrong fields ([426fd00](https://github.com/chrisdoc/hevy-mcp/commit/426fd006eb04e417647cf2ec07e48520244017bb))

### Features

- add support for rep range and RPE fields in routines ([#90](https://github.com/chrisdoc/hevy-mcp/issues/90)) ([81cb552](https://github.com/chrisdoc/hevy-mcp/commit/81cb552abe6dac0390cb92fd79fdb84ea4704432))

## [1.7.16](https://github.com/chrisdoc/hevy-mcp/compare/v1.7.15...v1.7.16) (2025-08-25)

## [1.7.15](https://github.com/chrisdoc/hevy-mcp/compare/v1.7.14...v1.7.15) (2025-08-25)

## [1.7.14](https://github.com/chrisdoc/hevy-mcp/compare/v1.7.13...v1.7.14) (2025-08-18)

## [1.7.13](https://github.com/chrisdoc/hevy-mcp/compare/v1.7.12...v1.7.13) (2025-08-18)

## [1.7.12](https://github.com/chrisdoc/hevy-mcp/compare/v1.7.11...v1.7.12) (2025-08-11)

## [1.7.11](https://github.com/chrisdoc/hevy-mcp/compare/v1.7.10...v1.7.11) (2025-08-11)

## [1.7.10](https://github.com/chrisdoc/hevy-mcp/compare/v1.7.9...v1.7.10) (2025-08-04)

## [1.7.9](https://github.com/chrisdoc/hevy-mcp/compare/v1.7.8...v1.7.9) (2025-08-04)

## [1.7.8](https://github.com/chrisdoc/hevy-mcp/compare/v1.7.7...v1.7.8) (2025-07-28)

## [1.7.7](https://github.com/chrisdoc/hevy-mcp/compare/v1.7.6...v1.7.7) (2025-07-23)

## [1.7.6](https://github.com/chrisdoc/hevy-mcp/compare/v1.7.5...v1.7.6) (2025-07-22)

## [1.7.5](https://github.com/chrisdoc/hevy-mcp/compare/v1.7.4...v1.7.5) (2025-07-21)

## [1.7.4](https://github.com/chrisdoc/hevy-mcp/compare/v1.7.3...v1.7.4) (2025-07-21)

## [1.7.3](https://github.com/chrisdoc/hevy-mcp/compare/v1.7.2...v1.7.3) (2025-07-14)

## [1.7.2](https://github.com/chrisdoc/hevy-mcp/compare/v1.7.1...v1.7.2) (2025-07-14)

## [1.7.1](https://github.com/chrisdoc/hevy-mcp/compare/v1.7.0...v1.7.1) (2025-07-14)

# [1.7.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.6.1...v1.7.0) (2025-07-09)

### Features

- trigger new release ([b8c5e0e](https://github.com/chrisdoc/hevy-mcp/commit/b8c5e0e27cdf86becb96c7a69e550fb1a64a2ade))

# [1.7.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.6.1...v1.7.0) (2025-07-09)

### Features

- trigger new release ([b8c5e0e](https://github.com/chrisdoc/hevy-mcp/commit/b8c5e0e27cdf86becb96c7a69e550fb1a64a2ade))

# [1.7.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.6.1...v1.7.0) (2025-07-09)

### Features

- trigger new release ([b8c5e0e](https://github.com/chrisdoc/hevy-mcp/commit/b8c5e0e27cdf86becb96c7a69e550fb1a64a2ade))

# [1.7.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.6.1...v1.7.0) (2025-07-09)

### Features

- trigger new release ([b8c5e0e](https://github.com/chrisdoc/hevy-mcp/commit/b8c5e0e27cdf86becb96c7a69e550fb1a64a2ade))

## [1.6.2](https://github.com/chrisdoc/hevy-mcp/compare/v1.6.1...v1.6.2) (2025-07-09)

## [1.6.2](https://github.com/chrisdoc/hevy-mcp/compare/v1.6.1...v1.6.2) (2025-07-08)

## [1.6.2](https://github.com/chrisdoc/hevy-mcp/compare/v1.6.1...v1.6.2) (2025-07-08)

# [1.4.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.3.1...v1.4.0) (2025-06-06)

### Bug Fixes

- update integration test to parse JSON response correctly ([e79b4b7](https://github.com/chrisdoc/hevy-mcp/commit/e79b4b73f8f26528b4572cea1c2bb19d8779d9b0))
- update integration test to use correct imports ([e2f3137](https://github.com/chrisdoc/hevy-mcp/commit/e2f313737fa2012aba421302135ff93c32b73802))

### Features

- add hevy-mcp integration test best practices to enhance test reliability and maintainability ([dc12bf5](https://github.com/chrisdoc/hevy-mcp/commit/dc12bf5cb47760ff89450ab0728d52dbfa76b6c9))
- add integration tests for MCP server with real HevyAPI (get-workouts) ([c9d5a44](https://github.com/chrisdoc/hevy-mcp/commit/c9d5a44ec28ae8b14b811dae21a3c82babb1b2d3))
- add OpenTelemetry export step to CI workflow for trace monitoring ([55932b9](https://github.com/chrisdoc/hevy-mcp/commit/55932b9e37b47aaba0ac0832dd39c7107bcd47ea))
- add rules to re-run tests on source code changes and enhance integration test schemas ([bdff7d2](https://github.com/chrisdoc/hevy-mcp/commit/bdff7d2ea75a802bef84c24309e5bcad5b2c7112))
- improve error handling for missing HEVY_API_KEY ([1a7cbfb](https://github.com/chrisdoc/hevy-mcp/commit/1a7cbfb9ed82b70201b90a9cb7a9a2ed8ab9644f))
- make integration tests fail if HEVY_API_KEY is not set ([b03f5dc](https://github.com/chrisdoc/hevy-mcp/commit/b03f5dcc9b6c4ae961685679fb4c2c0b4f7d98f8))
- separate unit tests and integration tests in CI workflow ([219ba83](https://github.com/chrisdoc/hevy-mcp/commit/219ba834d95d7d80436139df15732dcd651c8e90))

## [1.3.1](https://github.com/chrisdoc/hevy-mcp/compare/v1.3.0...v1.3.1) (2025-06-04)

### Bug Fixes

- resolve linting issues in error-handler.ts ([f418700](https://github.com/chrisdoc/hevy-mcp/commit/f41870028aa5d66adef2b237d39bcbc50d8d61dc))
- resolve remaining linting issues ([643d037](https://github.com/chrisdoc/hevy-mcp/commit/643d03789043d8dd4bb563980581b679f6341908))

# [1.3.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.2.2...v1.3.0) (2025-04-11)

### Features

- update CI workflow to use Vitest for testing and add Codecov integration ([bc7e833](https://github.com/chrisdoc/hevy-mcp/commit/bc7e833aa2953b6405ba67e7dbe2ddf78be7c337))

## [1.2.1](https://github.com/chrisdoc/hevy-mcp/compare/v1.2.0...v1.2.1) (2025-03-30)

### Bug Fixes

- package.json loading ([0ad8af4](https://github.com/chrisdoc/hevy-mcp/commit/0ad8af40b0847f550eefb86a14462e310882493b))

# [1.2.0](https://github.com/chrisdoc/hevy-mcp/compare/v1.1.1...v1.2.0) (2025-03-27)

### Bug Fixes

- add missing permissions to release workflow ([b59ecb2](https://github.com/chrisdoc/hevy-mcp/commit/b59ecb2ef7f2b3219c93bed1d07d2f72cd64c163))

### Features

- add npmrc file ([ee62496](https://github.com/chrisdoc/hevy-mcp/commit/ee62496b695430ebaaee041dd85f596008987f11))
- enhance description of mcp server tools ([81517be](https://github.com/chrisdoc/hevy-mcp/commit/81517beb035c297b629e25eb1a0b6b53100fc317))
- use semantic versioning and commit lint ([00bc076](https://github.com/chrisdoc/hevy-mcp/commit/00bc0769e029d3ebdd0fce1799248a5ae4aaff2d))
