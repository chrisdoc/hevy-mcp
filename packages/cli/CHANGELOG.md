# @chrisdoc/hevy-cli

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
