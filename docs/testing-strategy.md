# Testing strategy for hevy-mcp

This page explains what the test layers protect, not how to install tools or
run the required PR baseline. Use these authoritative references:

- [CONTRIBUTING.md](../CONTRIBUTING.md#required-validation) for setup, required
  validation, generated-client procedures, and release policy.
- [test-lanes.md](./test-lanes.md) for lane selection, credentials, coverage
  commands, and performance methodology.
- [repository/validation-lanes.json](../repository/validation-lanes.json) for
  canonical selectors, runtimes, gates, artifacts, and aggregate membership.
- [package.json](../package.json) for command implementations and
  [project.json](../project.json) for Nx dependencies and cache policy.
- [test-lane-inventory.md](./test-lane-inventory.md) for discovered test names
  and overlaps. Test counts are a snapshot, not a coverage guarantee.

## Layers and responsibilities

| Layer                   | What it protects                                                                    | Boundary                                          |
| ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------- |
| Static checks and build | Types, imports, generated output, manifests, formatting, and package construction   | Repository source/configuration                   |
| Unit/component          | Domain decisions, schemas, error handling, caches, telemetry, and lifecycle helpers | Typed fakes or local fixtures                     |
| Mocked MCP              | Registration and public calls through SDK client/server transports                  | In-memory MCP with deterministic HTTP fixtures    |
| Contract                | Registration, output schemas, manifests, and runtime contract cases                 | Advertised inputs and returned structured content |
| Stdio                   | SDK-sensitive instrumentation, shutdown, and process regressions                    | Protocol stdout and process lifecycle             |
| Package smoke           | Candidate tarball contents, installation, binary, and representative execution      | Built/packed artifact, not merely source imports  |
| Worker                  | Workerd behavior and local HTTP adapter integration                                 | Worker bindings and request isolation             |
| Live and nightly        | Provider drift and published/source launcher behavior                               | Explicit credentials; bounded read-only calls     |
| Performance             | Startup, list/read latency, concurrency, and sequential correctness                 | Built Node process with child-local fixtures      |

These layers complement one another. A direct handler test does not prove that
`tools/list` advertises an input accepted by `tools/call`; an in-memory test
does not prove packaging or stdio framing. Live success does not replace
missing deterministic assertions. Named lanes can overlap intentionally.
The contract and stdio lanes remain narrower than a complete per-tool and
process-level matrix; see the scope limits in [test-lanes.md](./test-lanes.md#lane-ownership).

## Contract and fixture principles

- Derive handler arguments from input schemas. For input/output, registration,
  or compatibility changes, exercise both `tools/list` and `tools/call`.
- Reuse production response contracts in
  [output-schemas.ts](../packages/core/src/protocol/output-schemas.ts) and
  [response-contracts.ts](../packages/core/src/protocol/response-contracts.ts).
  Check `structuredContent` and supported text compatibility rather than
  maintaining a competing permissive schema.
- Cover empty/null results, invalid inputs, upstream failures, cancellation,
  deadlines, and mutation non-retry behavior where applicable. Preserve
  canonical advertised inputs separately from legacy compatibility parsing.
- Use typed fakes for narrow decisions and the existing shared harness for MCP
  regressions. The client uses native fetch; do not assume an Axios seam.
  Verify fixtures against the transport used by the specific test.
- Parent-process HTTP mocks cannot intercept a spawned child's requests.
  Process tests need child-local fixtures and explicit network isolation.
- Keep fixtures synthetic or sanitized. Never record keys, personal workout
  data, request dumps, or sensitive upstream bodies. Assert stable public error
  behavior rather than whole internal error objects.
- Ensure cleanup, fixture consumption, and unexpected-network assertions are
  part of correctness. Do not invoke Git or mutate Git configuration in tests.

## Coverage and performance interpretation

[vitest.config.ts](../vitest.config.ts) owns V8 reporting, exclusions, and
unit-lane thresholds. It does not currently declare an explicit all-production
`coverage.include`. Unit and mocked reports are partial views, not one combined
coverage score. [codecov.yml](../codecov.yml) owns hosted status policy; do not
infer a new ratchet or patch requirement from a historical target.

Performance timing is informational; fixture and response correctness gate
immediately. The current scenarios, report path, initial timing targets, and
baseline-review policy are maintained only in
[test-lanes.md](./test-lanes.md#performance-scenarios-and-report). Do not
benchmark the live Hevy API.

## Credentials and failures

Deterministic PR lanes use fake credentials and must not contact Hevy. Live
credentials belong only in explicitly credentialed environments. Possession
of a key does not authorize mutations: live checks remain bounded, read-only
canaries. Follow the preflight and environment rules in
[test-lanes.md](./test-lanes.md#exact-commands).

Keep server stdout protocol-only and diagnostics redacted. Report failed,
blocked, and unrun checks separately. Do not focus/disable tests, weaken
assertions, or use blind retries to conceal a failure. A flaky assertion needs
a diagnosed cause and a visible follow-up, not a silently weakened gate.

## Flake policy

Every flaky test needs an owner, tracking issue, first-seen date, observed rate,
and evidence artifact. Any approved quarantine must be visible and time-boxed
with an expiry; it is for a nondeterministic test, not a flaky product. Fix,
replace, or remove the test by that expiry under the normal review process.
Do not disable a test or weaken its assertions to make the current task pass.

Preserve the first CI failure when reporting a rerun. Retries are justified only
by an intentional production retry policy or a temporary measurement of a known
external flake, not to erase the original signal. Deterministic tests should
control time, randomness, ports, environment, network, and cleanup. Classify
live failures as provider, network, authentication, schema, or product failures.

## Historical context

The July 10, 2026 audit measured snapshot
`09859b1672e5408b8ca8d65dd4bb7b2c35a8dd03` and proposed TS-01 through TS-08
([issue #605](https://github.com/chrisdoc/hevy-mcp/issues/605)). Its
measurements, copied scripts, Node-policy concerns, Axios assumptions, and
30/60/90-day roadmap were historical design inputs, not current procedures or
verified ticket status. This page now describes the source-backed layering;
active procedures and remaining lane-scope limits live in the references above.
