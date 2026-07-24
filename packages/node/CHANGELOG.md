# hevy-mcp

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
