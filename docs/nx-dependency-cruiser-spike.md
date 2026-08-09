# Nx and dependency-cruiser control-plane migration

This stacked follow-up targets PR #890 and moves local repository orchestration
onto Nx plus dependency-cruiser. The canonical repository models own policy
facts; Nx owns project discovery, target invocation, dependency ordering,
affected selection, and cache policy. Root npm aliases remain compatibility
entrypoints for contributors and external automation, not a second owner of
aggregate membership or workflow orchestration. GitHub permissions,
environments, deployment mechanics, and Changesets remain explicit owners where
they carry credentials or release policy.

## Run the proof of concept

Nx discovers the six npm workspaces from `packages/*` and the root
`repository` project from `project.json`:

```sh
npx nx show projects
npx nx show project repository --json
npx nx graph --file=.nx/project-graph.html
```

The graph file is an inspection artifact under ignored `.nx/`; do not commit
it. To inspect the task graph without writing a graph file, use:

```sh
npx nx report
npx nx show project repository --json
```

Run the control-plane aggregate and an explicit clean-base affected query with
no dependency on a dirty local `main`:

```sh
npx nx run repository:control-plane
npx nx affected --target=control-plane --base=origin/main --head=HEAD
```

The aggregate target and member identities come from the canonical validation
lane model. The contributor tables in [`docs/test-lanes.md`](./test-lanes.md)
show the current lane and aggregate membership, while `project.json` is the
source for target dependencies. Do not
copy a target or member count into prose: derive the current graph with
`npx nx show project repository --json` (or `npx nx graph`). Contributor-facing
root aliases remain supported compatibility entrypoints; internal-only lanes
use their corresponding Nx targets directly, so command text is not duplicated
in the policy model.

Run the dependency rules through the combined boundary lane and exercise the
representative pack target:

```sh
npm run check:boundaries
npx nx run repository:check:boundaries
npx nx run repository:pack:artifacts --skip-nx-cache
```

The pack target builds the publishable Node server and CLI before writing
`.nx/pack/hevy-mcp-*.tgz` and `.nx/pack/chrisdoc-hevy-cli-*.tgz`. This is
representative artifact metadata only: Node and CLI npm packs are exercised;
Worker and Docker candidate provenance is absent.

## Migration contract

- Nx target metadata and executors own local task orchestration, including
  inputs, outputs, cacheability, dependency ordering, and aggregate invocation.
  Root npm scripts remain compatibility aliases where they are retained; they
  are not an independent aggregate registry.
- Deterministic checks and test lanes may be cached; live integration, nightly,
  release/version, package, Worker deployment/dry-run, performance, and
  token-cost targets are explicitly non-cacheable.
- The workerd pool lane remains machine-exclusive because CPU contention can
  violate its five-second integration timeout. Worker HTTP and dry-run lanes
  use isolated runtimes and can run concurrently. The `pack:artifacts` target
  is the sole writer for publishable output; package smoke and Publint targets
  consume its immutable tarballs concurrently.
- Vitest and token-cost arguments pass through Nx with `npx nx run ... -- ...`;
  no workflow needs to depend on undocumented Nx executor internals.
- `npm ci`, Docker actions, Wrangler deployment commands, Changesets actions,
  commit verification, secrets, and environment gates remain explicit because
  they are infrastructure or release policy rather than local project graph
  concerns.

## What this demonstrates alongside PR #889

- The canonical `repository/` models own workspace identities, publishability,
  release policy, artifact provenance, and validation lanes. Nx projects and
  targets consume those facts for local graph execution; the contributor lane
  documentation mirrors the model, not another policy registry.
- Nx target metadata and its task graph now own local task orchestration. The
  build/test, nightly, release-local, and token-cost workflows invoke Nx
  targets; workflow triggers, matrices, permissions, secrets, and deployment
  conditions remain explicit, while the release Worker canary is now blocking.
- dependency-cruiser supplies a library-backed module graph and declarative
  package/runtime restrictions instead of another custom graph walker. The
  compiler-backed boundary checker remains authoritative.
- Target metadata records representative inputs and outputs: Kubb generated
  client sources, emitted `dist` directories only for publishable package
  builds, Node build output, server/plugin manifests, coverage and performance
  evidence, and the explicit npm-pack target described above. Type-check-only
  workspace builds declare no output because they are side-effect free.

This is a local orchestration migration, not a universal runtime/product
manifest. PR #889's `repository/` control-plane implementation is the canonical
policy source for this branch; consumer checks and documentation must read it
through the shared facade rather than maintaining duplicate registries.

## Evidence from this migration

| Evidence                            | Current migration result                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Canonical validation policy         | `repository/validation-lanes.json`, validated by `scripts/check-control-plane.mjs`                               |
| Current aggregate and target counts | Derived at check time from the lane model and `project.json`; see `npx nx show project repository --json`        |
| Current workflow command ownership  | Workflows invoke Nx targets; credentials, matrices, permissions, and deployment conditions remain workflow-owned |
| Historical migration measurements   | Not repeated here; preserve only as immutable before-adoption evidence when a comparison is required             |

The current target graph and aggregate membership are intentionally derived
instead of copied into this document. This avoids presenting a stale execution
count as if it were a live measurement.

## What remains custom

- Curated package export maps, generated-client closure, and server/plugin
  manifest synchronization remain owned by their existing scripts.
- Release candidate selection, bundled Changeset cascades, empty-Changeset
  policy, and release publication remain Changesets/repository policy rather
  than Nx metadata.
- Credentials, live-network gates, release selectors, Docker actions, and exact
  GitHub matrix/job/step conditions remain workflow-owned. Only local command
  invocation moved to Nx.
- The token-cost job measures the current revision through Nx, enforces only
  the total catalog budget, and publishes the current JSON report; it does not
  maintain a historical comparison baseline.
- Historical before/after execution evidence is not inferable from Nx. Any
  retained number must be labeled immutable before-adoption evidence; current
  counts are derived from the canonical model and project graph.
- The compiler-backed `check-package-boundaries.mjs` remains authoritative in
  the combined Nx `check:boundaries` target. dependency-cruiser v18 does not
  support this repository's TypeScript 7 compiler, so the migration uses its SWC
  parser; local literal test imports are allowed while the compiler checker
  still rejects non-literal dynamic loading and all runtime-forbidden imports.
  The dependency-cruiser fixture also verifies that the module graph rejects a
  circular workspace edge.

## Install-script review

Nx's postinstall checks the platform and only touches Nx Cloud when it is
configured; Nx Cloud is not configured here. SWC's postinstall validates its
native binding and may install a matching `@swc/wasm` fallback. `allowScripts`
remains unchanged. Production adoption therefore still needs an explicit
policy decision about install-time behavior rather than silently broadening
the current dependency policy.

## Recommendation

Keep Nx as the local project/task graph and affected selector. Retain the
narrow policy and artifact checks, Changesets, GitHub security controls, and
Cloudflare deployment paths as explicit owners.
