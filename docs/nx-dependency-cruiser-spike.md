# Nx and dependency-cruiser control-plane migration

This stacked follow-up targets PR #890 and moves local repository orchestration
onto Nx plus dependency-cruiser. Nx owns project discovery, target invocation,
dependency ordering, affected selection, and cache policy; npm aliases remain
compatibility entrypoints for contributors and external automation. GitHub
permissions, environments, deployment mechanics, and Changesets remain
explicit owners where they carry credentials or release policy.

## Run the proof of concept

Nx discovers the five npm workspaces from `packages/*` and the root
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

The aggregate covers the issue #873 validation entrypoints and the server
manifest check. It has eight direct Nx dependency nodes after deduplication:
`check:changeset` invokes both the release-candidate and package Changeset
checks transitively, so neither is listed twice. Existing validation aliases
remain CLI-facing compatibility entrypoints; workflows invoke the corresponding
Nx targets instead of embedding duplicate command bodies. The `test:pr` target
also expands its nine deterministic test lanes as Nx dependencies; its npm
script remains a compatibility alias.

Run the dependency rules independently, through the combined boundary lane,
and exercise the representative pack target:

```sh
npm run check:dependency-cruiser
npm run check:boundaries
npx nx run repository:check:dependency-cruiser
npx nx run repository:check:boundaries
npx nx run repository:pack:artifacts --skip-nx-cache
```

The pack target builds the publishable Node server and CLI before writing
`.nx/pack/hevy-mcp-*.tgz` and `.nx/pack/chrisdoc-hevy-cli-*.tgz`. This is
representative artifact metadata only: Node and CLI npm packs are exercised;
Worker and Docker candidate provenance is absent.

The dependency-cruiser test fixture proves that representative neutral Node
builtin, neutral-to-Node, and Worker observability imports fail closed:

```sh
npx vitest run scripts/control-plane-config.test.ts
```

## Migration contract

- Root npm scripts remain the command bodies, while Nx target metadata owns
  inputs, outputs, cacheability, dependency ordering, and workflow invocation.
- Deterministic checks and test lanes may be cached; live integration, nightly,
  release/version, package, Worker deployment/dry-run, performance, and
  token-cost targets are explicitly non-cacheable.
- Worker and package smoke lanes opt out of Nx task parallelism because they
  exercise shared local runtimes and publishable output directories.
- Vitest and token-cost arguments pass through Nx with `npx nx run ... -- ...`;
  no workflow needs to depend on undocumented Nx executor internals.
- `npm ci`, Docker actions, Wrangler deployment commands, Changesets actions,
  commit verification, secrets, and environment gates remain explicit because
  they are infrastructure or release policy rather than local project graph
  concerns.

## What this demonstrates alongside PR #889

- Nx infers package identities, dependency edges, and manifest-derived runtime,
  publishability, and role tags as an alternative owner for those facts. The
  existing workspace and publishability registries remain in place; this migration
  deletes zero registry fragments.
- Nx target metadata and its task graph now own local task orchestration. The
  build/test, nightly, release-local, and token-cost workflows invoke Nx
  targets; no workflow trigger, matrix, permission, secret, or deployment
  condition was changed.
- dependency-cruiser supplies a library-backed module graph and declarative
  package/runtime restrictions instead of another custom graph walker. The
  compiler-backed boundary checker remains authoritative.
- Target metadata records representative inputs and outputs: Kubb generated
  client sources, emitted `dist` directories only for publishable package
  builds, Node build output, server/plugin manifests, coverage and performance
  evidence, and the explicit npm-pack target described above. Type-check-only
  workspace builds declare no output because they are side-effect free.

This is a local orchestration migration, not a universal runtime/product
manifest. PR #889's separate `repository/` control-plane implementation is not
deleted by this stacked branch; a later adoption decision must prove parity
before removing duplicate owners.

## Evidence from this migration

| Evidence                               | Current migration result                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Existing registry fragments deleted    | 0                                                                                                                |
| GitHub workflows migrated              | 4 local command surfaces; triggers, matrices, permissions, and deployment conditions unchanged                   |
| CI workflow command count              | 56 `run:` steps, unchanged                                                                                       |
| Local Nx aggregate after deduplication | 8 direct control-plane task nodes; `check:changeset` transitively invokes both omitted checks                    |
| Handwritten control-plane surface      | 865 lines: `project.json` 212, `nx.json` 51, `.dependency-cruiser.cjs` 109, focused test 415, metadata plugin 78 |
| `package-lock.json` impact             | +2,295/-440 lines versus `origin/main`; no new lockfile edit in this amendment                                   |

The line count is a measurement of the current files, not a historical
execution comparison. This migration does not fabricate a comparable
before/after aggregate execution count.

## What remains custom

- Curated package export maps, generated-client closure, and server/plugin
  manifest synchronization remain owned by their existing scripts.
- Release candidate selection, bundled Changeset cascades, empty-Changeset
  policy, and release publication remain Changesets/repository policy rather
  than Nx metadata.
- Credentials, live-network gates, release selectors, Docker actions, and exact
  GitHub matrix/job/step conditions remain workflow-owned. Only local command
  invocation moved to Nx.
- The token-cost job intentionally keeps its base-revision fallback on the npm
  alias because that checkout may predate Nx; the current revision uses Nx.
- Historical before/after registry and aggregate execution evidence is not
  inferable from Nx and remains an explicit reporting concern.
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
