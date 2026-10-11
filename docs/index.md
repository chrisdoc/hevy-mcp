# Documentation index

Start here to choose a document; read the linked source before changing behavior.
For coding agents, [AGENTS.md](../AGENTS.md) is the instruction entry point.
[CLAUDE.md](../CLAUDE.md) is a symlink to it, not a second instruction set.

## Read by task

| Task                                                 | Start here                                                                                                    | Verify against                                                                                                                                                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connect an MCP client or choose hosting              | [Consumer README](../README.md), [deployment modes](./deployment-modes.md)                                    | [Node arguments](../packages/node/src/utils/arguments.ts), [Worker request handler](../packages/worker/src/worker.ts)                                                                                                                                                   |
| Set up a checkout, validate, prepare a release       | [Contributor guide](../CONTRIBUTING.md)                                                                       | [Commands](../package.json), [pinned tools](../mise.toml), [hooks](../lefthook.yml)                                                                                                                                                                                     |
| Find code and respect package boundaries             | [Architecture](./architecture.md)                                                                             | [Topology](../repository/topology.json), [boundary checker](../scripts/check-package-boundaries.mjs)                                                                                                                                                                    |
| Change an MCP tool or response contract              | [AGENTS MCP contracts](../AGENTS.md#mcp-changes)                                                              | [Tool registration](../packages/core/src/tools/register.ts), [tool definition](../packages/core/src/tools/define-tool.ts), [protocol contracts](../packages/core/src/protocol/response-contracts.ts), [output schemas](../packages/core/src/protocol/output-schemas.ts) |
| Change reusable domain behavior                      | [Architecture](./architecture.md)                                                                             | [Operations](../packages/operations/src/index.ts), [mutation semantics](../packages/operations/src/mutation-semantics.ts)                                                                                                                                               |
| Change API retries or regenerate client types        | [Generated-client procedure](../CONTRIBUTING.md#generated-api-client)                                         | [Endpoint policy](../packages/hevy-client/src/endpoint-policy.ts), [OpenAPI corrections](../scripts/codegen/openapi-spec.js), [Kubb config](../packages/hevy-client/kubb.config.ts)                                                                                     |
| Change Node lifecycle or transports                  | [Node README](../packages/node/README.md)                                                                     | [Runtime](../packages/node/src/runtime.ts), [Node entry point](../packages/node/src/index.ts)                                                                                                                                                                           |
| Change Worker authentication, origins, or deployment | [Worker procedure](../CONTRIBUTING.md#cloudflare-worker-development)                                          | [Worker](../packages/worker/src/worker.ts), [OAuth](../packages/worker/src/worker-oauth.ts), [typed config](../packages/worker/cloudflare.config.ts)                                                                                                                    |
| Change the standalone CLI                            | [CLI README](../packages/cli/README.md)                                                                       | [Arguments](../packages/cli/src/arguments.ts), [routes](../packages/cli/src/routes.ts)                                                                                                                                                                                  |
| Select tests and understand live gates               | [Test lanes](./test-lanes.md), [testing strategy](./testing-strategy.md)                                      | [Lane registry](../repository/validation-lanes.json), [test runner](../scripts/testing/run-vitest-lane.mjs)                                                                                                                                                             |
| Change diagnostics or telemetry                      | [Observability](./observability.md), [Worker version attribution](./cloudflare-worker-version-attribution.md) | [Node telemetry](../packages/node/src/utils/telemetry.ts), [Worker telemetry](../packages/worker/src/worker-telemetry.ts)                                                                                                                                               |
| Change tool descriptions or schema token budgets     | [Token-cost tracking](./token-cost-tracking.md)                                                               | [Measurement script](../scripts/metrics/measure-token-cost.ts)                                                                                                                                                                                                          |

## Documentation ownership

- **README** owns consumer installation and connection examples.
- **CONTRIBUTING** owns development procedures, required validation, and release
  policy. Onboarding and topic guides should link there instead of copying setup
  commands or release matrices.
- **AGENTS** owns agent decisions and safety constraints, not changing inventories.
- **Topology, lane registry, manifests, and configuration** own changing facts.
  Prose explains how to use them; source and contract tests establish behavior.
- **Topic guides** explain architecture, operations, and testing rationale.
  Verify implementation details in the source links above.

When documentation and source disagree, record the discrepancy and fix the
appropriate document or implementation according to the task. Do not silently
change runtime contracts to match stale prose. Verify both adapters when shared
MCP behavior changes.

## Reference and historical material

- [Telemetry data dictionary](./telemetry-data-dictionary.md) and
  [dashboards](./telemetry-dashboards.md)
- [Privacy policy](./privacy-policy.md)
- [Type-safety guide](./TYPE_SAFETY_GUIDE.md)
- [Test-lane inventory](./test-lane-inventory.md): generated snapshot; regenerate
  using the procedure in the test-lane guide rather than hand-editing counts.

Reports and plans such as `anti-slop-*`, `knip-candidate-report.md`,
`nx-dependency-cruiser-spike.md`, and `superpowers/` capture bounded reviews or
proposals. They are not current setup instructions or evidence that a proposed
change shipped. Check their scope and verify claims against the current tree.

## Maintaining documentation

For documentation-only work, check changed-file formatting, relative links and
anchors, and every changed behavior claim against source. Keep commands tied to
`package.json` and avoid copying tool versions, origin allowlists, lane counts,
or transitive release cascades. Runtime changes still require the validation
baseline and affected lanes in CONTRIBUTING. A documentation change under
`packages/*` also participates in the repository's workspace Changeset policy.
