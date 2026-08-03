# Nx and dependency-cruiser control-plane spike

This spike answers whether open-source Nx plus dependency-cruiser can cover the
stable repository facts in issue #873 without introducing a second universal
manifest. It is intentionally local: Nx Cloud and every hosted service are
disabled, and GitHub workflows are unchanged.

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

The aggregate covers the nine issue #873 validation entrypoints. It has seven
direct Nx dependency nodes after deduplication: `check:changeset` invokes both
the release-candidate and package Changeset checks transitively, so neither is
listed twice.
Existing validation aliases remain the CLI-facing entrypoints; the
`check:boundaries` alias now composes the compiler-backed boundary check with
dependency-cruiser, while Nx metadata delegates root targets to the npm
scripts instead of copying their command bodies.

Run the dependency rules independently, through the combined boundary lane,
and exercise the representative pack target:

```sh
npm run check:dependency-cruiser
npm run check:boundaries
npx nx run repository:dependency-cruiser
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

## What this demonstrates alongside PR #889

- Nx infers package identities, dependency edges, and manifest-derived runtime,
  publishability, and role tags as an alternative owner for those facts. The
  existing workspace and publishability registries remain in place; this spike
  deletes zero registry fragments.
- Nx target metadata and its task graph demonstrate an alternative owner for
  local task orchestration. The existing npm dispatcher, lane manifests,
  generated workflow projection, and workflows remain; this spike migrates
  zero workflows.
- dependency-cruiser supplies a library-backed module graph and declarative
  package/runtime restrictions instead of another custom graph walker. The
  compiler-backed boundary checker remains authoritative.
- Target metadata records representative inputs and outputs: Kubb generated
  client sources, Node build output, server/plugin manifests, coverage and
  performance evidence, and the explicit npm-pack target described above.

This is deliberately a reshape, not a drop-in replacement for PR #889's
`repository/` control-plane manifest, lane dispatcher, generated workflow
projection, or historical evidence registry.

## Evidence from this spike

| Evidence                               | Current spike result                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Existing registry fragments deleted    | 0                                                                                                                |
| GitHub workflows migrated              | 0 (0 workflow files touched)                                                                                     |
| CI workflow command count              | 56 `run:` steps, unchanged                                                                                       |
| Local Nx aggregate after deduplication | 7 direct control-plane task nodes; `check:changeset` transitively invokes both omitted checks                    |
| Handwritten control-plane surface      | 547 lines: `project.json` 107, `nx.json` 46, `.dependency-cruiser.cjs` 109, focused test 225, metadata plugin 60 |
| `package-lock.json` impact             | +2,295/-440 lines versus `origin/main`; no new lockfile edit in this amendment                                   |

The line count is a measurement of the current files, not a historical
execution comparison. This spike does not fabricate a comparable before/after
aggregate execution count.

## What remains custom

- Curated package export maps, generated-client closure, and server/plugin
  manifest synchronization remain owned by their existing scripts.
- Release candidate selection, bundled Changeset cascades, empty-Changeset
  policy, and release publication remain Changesets/repository policy rather
  than Nx metadata.
- Credentials, live-network gates, Worker dry-runs, release selectors, Docker
  checks, and exact GitHub matrix/job/step conditions are not represented by
  the local graph. Workflows were not rewritten in this spike.
- Historical before/after registry and aggregate execution evidence is not
  inferable from Nx and remains an explicit reporting concern.
- The compiler-backed `check-package-boundaries.mjs` remains authoritative in
  the combined Nx `check:boundaries` target. dependency-cruiser v18 does not
  support this repository's TypeScript 7 compiler, so the spike uses its SWC
  parser; local literal test imports are allowed while the compiler checker
  still rejects non-literal dynamic loading and all runtime-forbidden imports.

## Install-script review

Nx's postinstall checks the platform and only touches Nx Cloud when it is
configured; Nx Cloud is not configured here. SWC's postinstall validates its
native binding and may install a matching `@swc/wasm` fallback. `allowScripts`
remains unchanged. Production adoption therefore still needs an explicit
policy decision about install-time behavior rather than silently broadening
the current dependency policy.

## Recommendation

Reshape PR #889 around these open-source primitives. Keep the existing narrow
policy and artifact checks, use Nx for project/task discovery and affected
selection, and use dependency-cruiser as a fast declarative supplement to the
compiler-backed boundary gate. Do not merge a universal manifest or workflow
projection that duplicates implementation YAML and runtime configuration.
