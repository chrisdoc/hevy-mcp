# @chrisdoc/hevy-cli

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
