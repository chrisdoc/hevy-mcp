# Contributor onboarding

Welcome! This page is a map to the current contributor workflow; it deliberately
does not duplicate setup, validation, or release procedures. Start with
[CONTRIBUTING.md](../CONTRIBUTING.md) for pinned tool installation, credentials,
local startup, the required PR checks, and Changesets.

## Find your way around

The repository root is a private workspace orchestrator. The six runtime and
package workspaces are declared in [`repository/topology.json`](../repository/topology.json):

| Workspace              | Responsibility                                                  |
| ---------------------- | --------------------------------------------------------------- |
| `packages/hevy-client` | Runtime-neutral Hevy client and curated generated types/schemas |
| `packages/operations`  | Runtime-neutral Hevy domain operations                          |
| `packages/core`        | MCP tools, prompts, resources, and server construction          |
| `packages/node`        | Node lifecycle, transports, and telemetry                       |
| `packages/worker`      | Cloudflare Worker transport and optional OAuth                  |
| `packages/cli`         | Public standalone Hevy CLI                                      |

The dependency direction and runtime boundaries are documented in
[architecture.md](./architecture.md). In short, keep Node built-ins and
Cloudflare bindings out of the runtime-neutral client, operations, and core
packages; the Node and Worker adapters do not import one another.

## Choose the right reference

| If you need to…                                  | Use…                                           |
| ------------------------------------------------ | ---------------------------------------------- |
| Connect or install the product                   | [README.md](../README.md)                      |
| Set up a development environment or prepare a PR | [CONTRIBUTING.md](../CONTRIBUTING.md)          |
| Find a deterministic, live, or package test lane | [test-lanes.md](./test-lanes.md)               |
| Understand package/runtime boundaries            | [architecture.md](./architecture.md)           |
| Work with Hevy response or MCP input types       | [TYPE_SAFETY_GUIDE.md](./TYPE_SAFETY_GUIDE.md) |
| Follow repository-specific agent instructions    | [AGENTS.md](../AGENTS.md)                      |

Use the named `pnpm run test:*` commands documented in `docs/test-lanes.md`;
the machine-readable lane registry lives in
[`repository/validation-lanes.json`](../repository/validation-lanes.json).
Deterministic lanes use fake credentials. Live Hevy lanes and their credential
requirements are listed separately in that reference and in CONTRIBUTING.

For code changes, follow the existing module and test patterns in the owning
workspace. Tool input schemas are the source of handler parameter types, and
generated Hevy client output is maintained through the OpenAPI/Kubb workflow
documented in CONTRIBUTING.
