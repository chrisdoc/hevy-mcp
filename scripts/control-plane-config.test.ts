import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cruise, format, type IFlattenedRuleSet } from "dependency-cruiser";
import { afterEach, describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
type ControlPlaneRuleSet = IFlattenedRuleSet & {
	forbidden: NonNullable<IFlattenedRuleSet["forbidden"]>;
};
const dependencyCruiserConfig = require(
	resolve(root, ".dependency-cruiser.cjs"),
) as ControlPlaneRuleSet;

const metadata = require(resolve(root, "scripts/nx-project-metadata.cjs")) as {
	buildOutputs(packageJson: Record<string, unknown>): string[];
	buildTarget(packageJson: Record<string, unknown>): {
		cache?: boolean;
		inputs?: string[];
		outputs: string[];
	};
};

const inferredTargets = [
	"check:control-plane",
	"check:boundaries",
	"check:exports",
	"check:package-changesets",
	"check",
	"check:types",
	"check:changeset",
	"check:server-manifest",
	"build",
	"build:client",
	"sync:server-manifest",
	"test:unit",
	"test:release-unit",
	"test:mcp",
	"test:integration",
	"test:diagnostics",
	"test:contract",
	"test:stdio",
	"test:worker",
	"test:worker-http",
	"test:cli",
	"test:nightly",
	"test:live",
	"test:worker-http:live",
	"measure:tokens",
	"worker:dry-run",
	"test:coverage",
] as const;

const orchestratedTargets = [
	"check:publint",
	"test:pack",
	"test:pack:cli",
	"test:performance",
] as const;

const aggregateTargets = [
	"check:control-plane",
	"check:boundaries",
	"check:exports",
	"test:pr",
	"check:server-manifest",
	"check",
	"check:types",
	"check:changeset",
] as const;

const fixtureRoots: string[] = [];

async function createFixture(
	packageName: "core" | "worker",
	files: Record<string, string>,
) {
	await mkdir(join(root, ".nx/control-plane-fixtures"), { recursive: true });
	const fixtureRoot = await mkdtemp(
		join(root, ".nx/control-plane-fixtures/fixture-"),
	);
	fixtureRoots.push(fixtureRoot);

	for (const [path, contents] of Object.entries(files)) {
		const target = join(fixtureRoot, path);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, contents);
	}

	const prefix = relative(root, fixtureRoot).replaceAll("\\", "/");
	const rewrite = (value: unknown): unknown => {
		if (typeof value === "string") {
			return value.replaceAll("^packages/", `^${prefix}/packages/`);
		}
		if (Array.isArray(value)) return value.map(rewrite);
		if (value && typeof value === "object") {
			return Object.fromEntries(
				Object.entries(value).map(([key, entry]) => [key, rewrite(entry)]),
			);
		}
		return value;
	};
	const ruleSet: ControlPlaneRuleSet = structuredClone(dependencyCruiserConfig);
	ruleSet.forbidden = ruleSet.forbidden.map(
		(rule) => rewrite(rule) as ControlPlaneRuleSet["forbidden"][number],
	);

	const result = await cruise([join(fixtureRoot, "packages")], {
		baseDir: root,
		parser: "swc",
		ruleSet,
		validate: true,
	});
	if (typeof result.output === "string") {
		throw new Error(
			"dependency-cruiser returned a formatted string unexpectedly",
		);
	}
	const report = await format(result.output, { outputType: "err" });
	return { packageName, report };
}

describe("Nx and dependency-cruiser control-plane migration", () => {
	it("scopes pull-request secrets to build steps and reuses their artifacts", async () => {
		const workflow = await readFile(
			resolve(root, ".github/workflows/build-and-test.yml"),
			"utf8",
		);
		const node26Build = workflow.slice(
			workflow.indexOf("      - name: Run Node 26 build"),
			workflow.indexOf("      - name: Run Node 24 validation graph"),
		);
		const node24 = workflow.slice(
			workflow.indexOf("      - name: Run Node 24 validation graph"),
			workflow.indexOf("      - name: Run Node 26 validation graph"),
		);
		const packageJob = workflow.slice(
			workflow.indexOf("  package-performance:"),
			workflow.indexOf("  docker:"),
		);
		const packageBuild = packageJob.slice(
			packageJob.indexOf("      - name: Build package candidate"),
			packageJob.indexOf("      - name: Prepare shared package candidates"),
		);
		const prepare = packageJob.slice(
			packageJob.indexOf("      - name: Prepare shared package candidates"),
			packageJob.indexOf("      - name: Run isolated performance validation"),
		);
		const packageValidation = packageJob.slice(
			packageJob.indexOf("      - name: Run isolated performance validation"),
			packageJob.indexOf("      - name: Upload performance summary"),
		);

		expect(node26Build).toContain("if: matrix.node-version == '26.x'");
		expect(node26Build).toMatch(
			/SENTRY_AUTH_TOKEN: \$\{\{ secrets\.SENTRY_AUTH_TOKEN \}\}/,
		);
		expect(node26Build).toMatch(
			/OTEL_COLLECTOR_TOKEN: \$\{\{ secrets\.OTEL_COLLECTOR_TOKEN \}\}/,
		);
		expect(packageBuild).toMatch(
			/SENTRY_AUTH_TOKEN: \$\{\{ secrets\.SENTRY_AUTH_TOKEN \}\}/,
		);
		expect(packageBuild).toMatch(
			/OTEL_COLLECTOR_TOKEN: \$\{\{ secrets\.OTEL_COLLECTOR_TOKEN \}\}/,
		);
		expect(prepare).not.toContain("secrets.");
		expect(prepare).toContain("npx nx run @chrisdoc/hevy-cli:build");
		expect(prepare).toContain(
			"npx nx run repository:pack:artifacts --excludeTaskDependencies",
		);
		expect(node24).not.toContain("secrets.");
		expect(node24).toContain("--excludeTaskDependencies");
		expect(packageValidation).not.toContain("secrets.");
		expect(packageValidation).toContain(
			"npx nx run repository:test:performance --excludeTaskDependencies",
		);
	});

	it("declares the canonical model check as an explicit target", async () => {
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as { targets: Record<string, { inputs?: string[] }> };

		expect(project.targets["check:control-plane"]?.inputs).toEqual([
			"controlPlaneInputs",
		]);
	});

	it("infers root npm targets without duplicating command bodies", async () => {
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as {
			targets: Record<
				string,
				{ executor?: string; options?: { command?: string } }
			>;
		};
		const packageJson = JSON.parse(
			await readFile(resolve(root, "package.json"), "utf8"),
		) as { scripts: Record<string, string> };

		for (const target of inferredTargets) {
			expect(project.targets[target]).toBeDefined();
			expect(packageJson.scripts[target]).toEqual(expect.any(String));
			expect(project.targets[target]?.executor).toBeUndefined();
			expect(project.targets[target]?.options?.command).toBeUndefined();
		}
	});

	it("models test:pr as the complete deterministic test lane", async () => {
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as {
			targets: Record<
				string,
				{
					dependsOn?: string[];
					executor?: string;
					options?: { command?: string };
				}
			>;
		};
		const testPr = project.targets["test:pr"];
		expect(testPr?.executor).toBe("nx:noop");
		expect(testPr?.options?.command).toBeUndefined();
		expect(testPr?.dependsOn).toEqual([
			"test:unit",
			"test:mcp",
			"test:contract",
			"test:stdio",
			"test:worker",
			"test:worker-http",
			"test:pack",
			"test:cli",
			"test:pack:cli",
			"check:publint",
		]);
	});

	it("keeps both package candidates in release validation", async () => {
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as { targets: Record<string, { dependsOn?: string[] }> };
		expect(project.targets["release:validate"]?.dependsOn).toEqual(
			expect.arrayContaining([
				"check:server-manifest",
				"test:pack",
				"test:pack:cli",
				"check:publint",
			]),
		);
	});

	it("runs package validation against the same release candidates", async () => {
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as {
			targets: Record<
				string,
				{
					cache?: boolean;
					dependsOn?: string[];
					executor?: string;
					parallelism?: boolean;
					options?: { command?: string };
				}
			>;
		};
		const packageJson = JSON.parse(
			await readFile(resolve(root, "package.json"), "utf8"),
		) as { scripts: Record<string, string> };

		const expected = {
			"check:publint": "mise exec -- node scripts/check-candidate-publint.mjs",
			"test:pack": "mise exec -- node tests/package/npm-pack-smoke.mjs",
			"test:pack:cli":
				"cross-env FORCE_COLOR=0 mise exec -- node packages/cli/tests/npm-pack-smoke.mjs",
		};
		for (const [target, command] of Object.entries(expected)) {
			expect(packageJson.scripts[target]).toBe(
				`mise exec -- npx nx run repository:${target}`,
			);
			expect(project.targets[target]).toMatchObject({
				cache: false,
				dependsOn: ["pack:artifacts"],
				executor: "nx:run-commands",
				options: { command },
			});
			expect(project.targets[target]?.parallelism).toBeUndefined();
		}
	});

	it("keeps CI reporting inside the canonical unit and mocked lanes", async () => {
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as {
			targets: Record<string, { inputs?: Array<string | { env: string }> }>;
		};
		const packageJson = JSON.parse(
			await readFile(resolve(root, "package.json"), "utf8"),
		) as { scripts: Record<string, string> };
		const runner = await readFile(
			resolve(root, "scripts/run-vitest-lane.mjs"),
			"utf8",
		);

		expect(packageJson.scripts["test:unit"]).toBe(
			"mise exec -- node scripts/run-vitest-lane.mjs unit",
		);
		expect(packageJson.scripts["test:mcp"]).toBe(
			"mise exec -- node scripts/run-vitest-lane.mjs mocked",
		);
		for (const target of ["test:unit", "test:mcp"]) {
			expect(project.targets[target]?.inputs).toContainEqual({
				env: "HEVY_TEST_REPORT_MODE",
			});
		}
		expect(runner).toContain(
			'args.push("--coverage", "--coverage.reportsDirectory=coverage/unit");',
		);
	});

	it("leaves dependency-cruiser as an inferred npm target", async () => {
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as { targets: Record<string, unknown> };
		const packageJson = JSON.parse(
			await readFile(resolve(root, "package.json"), "utf8"),
		) as { scripts: Record<string, string> };

		expect(project.targets["dependency-cruiser"]).toBeUndefined();
		expect(packageJson.scripts["check:dependency-cruiser"]).toEqual(
			expect.any(String),
		);
	});

	it("deduplicates transitive checks through check:changeset", async () => {
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as { targets: Record<string, { dependsOn?: string[] }> };
		const packageJson = JSON.parse(
			await readFile(resolve(root, "package.json"), "utf8"),
		) as { scripts: Record<string, string> };
		const aggregate = project.targets["control-plane"]?.dependsOn ?? [];
		expect(aggregate).toEqual(aggregateTargets);
		expect(aggregate).toHaveLength(8);
		expect(aggregate).not.toContain("check:package-changesets");
		expect(packageJson.scripts["check:changeset"]).toBe(
			"env -u GIT_DIR -u GIT_WORK_TREE changeset status --since=origin/main && env -u GIT_DIR -u GIT_WORK_TREE npm run check:package-changesets -- --since origin/main",
		);
		expect(packageJson.scripts["check:changeset"]).toContain(
			"npm run check:package-changesets",
		);
	});

	it("declares the control-plane aggregate as a no-op target", async () => {
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as { targets: Record<string, { executor?: string }> };

		expect(project.targets["control-plane"]?.executor).toBe("nx:noop");
	});

	it("builds both publishable packages once before packing artifacts", async () => {
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as {
			targets: Record<
				string,
				{
					cache?: boolean;
					dependsOn?: string[];
					executor?: string;
					options?: {
						command?: string;
						commands?: string[];
						parallel?: boolean;
					};
				}
			>;
		};
		const pack = project.targets["pack:artifacts"];
		expect(pack?.executor).toBe("nx:run-commands");
		expect(pack?.dependsOn).toEqual([
			"build",
			"@chrisdoc/hevy-cli:build",
			"check:server-manifest",
		]);
		expect(pack?.cache).toBe(false);
		expect(pack?.options?.command).toBe(
			"mise exec -- node scripts/pack-release-candidates.mjs",
		);
		expect(pack?.options?.commands).toBeUndefined();
	});

	it("runs performance checks against the shared Node build", async () => {
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as {
			targets: Record<
				string,
				{
					cache?: boolean;
					dependsOn?: string[];
					executor?: string;
					options?: { command?: string };
				}
			>;
		};
		const packageJson = JSON.parse(
			await readFile(resolve(root, "package.json"), "utf8"),
		) as { scripts: Record<string, string> };

		expect(packageJson.scripts["test:performance"]).toBe(
			"mise exec -- npx nx run repository:test:performance",
		);
		expect(project.targets["test:performance"]).toMatchObject({
			cache: false,
			dependsOn: ["build"],
			executor: "nx:run-commands",
			options: {
				command:
					"mise exec -- vitest run tests/performance/performance.test.ts",
			},
		});
	});

	it("keeps cached targets on explicit narrow named inputs", async () => {
		type TaskInput = string | { env: string };
		const nx = JSON.parse(await readFile(resolve(root, "nx.json"), "utf8")) as {
			namedInputs: Record<string, unknown>;
			targetDefaults: Record<
				string,
				| { cache?: boolean; inputs?: TaskInput[] }
				| Array<{
						cache?: boolean;
						inputs?: TaskInput[];
						dependsOn?: string[];
				  }>
			>;
		};
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as {
			targets: Record<string, { cache?: boolean; inputs?: TaskInput[] }>;
		};

		expect(nx.namedInputs.default).toBeUndefined();
		expect(
			Object.values(nx.namedInputs).flatMap((value) =>
				Array.isArray(value)
					? value.filter((entry): entry is string => typeof entry === "string")
					: [],
			),
		).not.toContain("default");

		const requiredInputs = [
			"repositoryConfig",
			"packageConfigs",
			"projectSources",
			"projectConfigs",
			"projectSharedConfigs",
			"projectTypeCheckInputs",
			"compilerConfigs",
			"rootSources",
			"runtimeSources",
			"testFixtures",
			"testShims",
			"testScripts",
			"controlPlaneModels",
			"unitSpecialInputs",
			"unitTests",
			"mockedTests",
			"contractTests",
			"stdioTests",
			"cliTests",
			"repositoryTypeCheckInputs",
			"packageBuildInputs",
			"repositoryBuildInputs",
			"nodeBuildInputs",
			"repositoryNodeBuildInputs",
			"cliBuildInputs",
			"manifestInputs",
			"openapiInputs",
			"boundaryInputs",
		] as const;
		for (const input of requiredInputs)
			expect(nx.namedInputs[input]).toEqual(expect.any(Array));

		const namedInputNames = new Set(Object.keys(nx.namedInputs));
		const assertNamedInputsResolve = (inputs: TaskInput[] | undefined) => {
			for (const input of inputs ?? []) {
				if (typeof input !== "string") {
					expect(input).toEqual({ env: expect.any(String) });
					continue;
				}
				if (input.startsWith("{")) continue;
				expect(namedInputNames.has(input)).toBe(true);
			}
		};
		for (const target of Object.values(project.targets))
			assertNamedInputsResolve(target.inputs);
		for (const target of Object.values(nx.targetDefaults)) {
			const entries = Array.isArray(target) ? target : [target];
			for (const entry of entries) assertNamedInputsResolve(entry.inputs);
		}

		for (const target of [
			"test:unit",
			"test:mcp",
			"test:contract",
			"test:stdio",
			"test:cli",
		]) {
			const inputs = project.targets[target]?.inputs;
			expect(inputs?.length).toBeGreaterThan(0);
			expect(inputs).not.toContain("default");
		}
		expect(project.targets.build?.cache).toBe(false);
		expect(project.targets.build?.inputs).toEqual([
			"repositoryNodeBuildInputs",
		]);
		expect(project.targets["check:types"]?.inputs).toEqual([
			"repositoryTypeCheckInputs",
		]);
		expect(nx.namedInputs.controlPlaneInputs).toEqual(
			expect.arrayContaining([
				"{workspaceRoot}/.nvmrc",
				"{workspaceRoot}/.github/workflows/build-and-test.yml",
				"{workspaceRoot}/.github/workflows/release.yml",
				"{workspaceRoot}/CONTRIBUTING.md",
				"{workspaceRoot}/docs/test-lanes.md",
			]),
		);
		expect(nx.targetDefaults.build).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					cache: true,
					inputs: ["packageBuildInputs"],
					dependsOn: ["^check:types"],
				}),
				expect.objectContaining({
					cache: true,
					inputs: ["cliBuildInputs"],
					filter: { projects: ["@chrisdoc/hevy-cli"] },
				}),
				expect.objectContaining({
					cache: false,
					inputs: ["nodeBuildInputs"],
					filter: { projects: ["hevy-mcp"] },
				}),
			]),
		);

		const unitInputs = nx.namedInputs.unitSpecialInputs as string[];
		expect(unitInputs).toEqual(
			expect.arrayContaining([
				"{workspaceRoot}/.github/workflows/release.yml",
				"{workspaceRoot}/.github/workflows/deploy-worker.yml",
				"{workspaceRoot}/docs/cloudflare-worker-version-attribution.md",
				"{workspaceRoot}/docs/clickstack-metrics.md",
				"{workspaceRoot}/.dependency-cruiser.cjs",
				"{workspaceRoot}/.cm/gitstream.cm",
				"{workspaceRoot}/.cm/plugins/filters/findDiffLocation/index.js",
				"{workspaceRoot}/packages/node/README.md",
			]),
		);
	});

	it("preserves package build target policy in the slim Nx plugin", async () => {
		const packages = await Promise.all(
			["node", "cli", "core", "hevy-client", "operations", "worker"].map(
				async (directory) =>
					JSON.parse(
						await readFile(
							resolve(root, "packages", directory, "package.json"),
							"utf8",
						),
					) as Record<string, unknown>,
			),
		);
		const byName = new Map(
			packages.map((packageJson) => [packageJson.name, packageJson]),
		);

		expect(metadata.buildTarget(byName.get("hevy-mcp") ?? {})).toMatchObject({
			cache: false,
			inputs: ["nodeBuildInputs"],
		});
		expect(
			metadata.buildTarget(byName.get("@chrisdoc/hevy-cli") ?? {}),
		).toMatchObject({
			cache: true,
			inputs: ["cliBuildInputs"],
		});
		for (const name of [
			"@hevy-mcp/core",
			"@hevy-mcp/hevy-client",
			"@hevy-mcp/operations",
			"@hevy-mcp/worker",
		]) {
			expect(metadata.buildTarget(byName.get(name) ?? {})).toMatchObject({
				cache: true,
				inputs: ["packageBuildInputs"],
			});
		}
		expect(metadata.buildOutputs(byName.get("hevy-mcp") ?? {})).toEqual([
			"{projectRoot}/dist",
		]);
	});

	it("keeps package task inputs local and repository inputs broad", async () => {
		const nx = JSON.parse(await readFile(resolve(root, "nx.json"), "utf8")) as {
			namedInputs: Record<string, unknown>;
		};
		expect(nx.namedInputs.projectSources).toEqual(["{projectRoot}/src/**/*"]);
		expect(nx.namedInputs.projectTypeCheckInputs).toEqual([
			"projectConfigs",
			"projectSharedConfigs",
			"projectSources",
		]);
		expect(nx.namedInputs.packageBuildInputs).toEqual([
			"projectTypeCheckInputs",
		]);
		expect(nx.namedInputs.repositoryTypeCheckInputs).toEqual([
			"compilerConfigs",
			"packageManifestInputs",
			"runtimeSources",
			"rootSources",
		]);
		expect(nx.namedInputs.repositoryNodeBuildInputs).toEqual([
			"repositoryBuildInputs",
			"{workspaceRoot}/packages/node/tsdown.config.ts",
		]);
	});

	it("keeps live and artifact targets out of the cache", async () => {
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as {
			targets: Record<
				string,
				{
					cache?: boolean;
					options?: Record<string, unknown>;
					outputs?: string[];
					parallelism?: boolean;
				}
			>;
		};

		for (const target of [
			"check",
			"test:integration",
			"test:diagnostics",
			"test:nightly",
			"test:live",
			"test:worker-http:live",
			"test:worker-http",
			"test:pack",
			"test:pack:cli",
			"worker:dry-run",
			"measure:tokens",
			"sync:server-manifest",
			"version:changesets",
			"version",
			"version:major",
			"version:minor",
			"version:patch",
			"release",
			"worker:deploy",
		]) {
			expect(project.targets[target]?.cache).toBe(false);
		}
		for (const target of [
			"test:worker-http",
			"test:pack",
			"test:pack:cli",
			"check:publint",
		]) {
			expect(project.targets[target]?.parallelism).toBeUndefined();
		}
		expect(project.targets["test:worker"]?.parallelism).toBe(false);
		for (const target of orchestratedTargets) {
			expect(project.targets[target]?.options).toBeDefined();
		}
		expect(project.targets["worker:dry-run"]?.outputs).toEqual([
			"{workspaceRoot}/.wrangler/dry-run",
		]);
	});

	it("fails closed for a neutral package importing a Node builtin", async () => {
		const { report } = await createFixture("core", {
			"packages/core/src/index.ts":
				'import "node:fs";\nexport const fixture = true;\n',
		});

		expect(report.exitCode).not.toBe(0);
		expect(report.output).toContain("neutral-no-node-builtins");
	});

	it("fails closed for circular workspace source", async () => {
		const { report } = await createFixture("core", {
			"packages/core/src/a.ts":
				'import { b } from "./b.js";\nexport const a = b;\n',
			"packages/core/src/b.ts":
				'import { a } from "./a.js";\nexport const b = a;\n',
		});

		expect(report.exitCode).not.toBe(0);
		expect(report.output).toContain("no-circular");
	});

	it("fails closed for an unresolved workspace source import", async () => {
		const { report } = await createFixture("core", {
			"packages/core/src/index.ts":
				'import "missing-workspace-package";\nexport const fixture = true;\n',
		});

		expect(report.exitCode).not.toBe(0);
		expect(report.output).toContain("workspace-source-only");
	});

	it("fails closed for a neutral-to-Node edge and Worker observability import", async () => {
		const direction = await createFixture("core", {
			"packages/core/src/index.ts":
				'import { fixture } from "../../node/src/index.js";\nexport { fixture };\n',
			"packages/node/src/index.ts": "export const fixture = true;\n",
		});
		const worker = await createFixture("worker", {
			"packages/worker/src/index.ts":
				'import "@sentry/node";\nexport const fixture = true;\n',
		});

		expect(direction.report.exitCode).not.toBe(0);
		expect(direction.report.output).toContain(
			"neutral-only-depends-on-neutral",
		);
		expect(worker.report.exitCode).not.toBe(0);
		expect(worker.report.output).toContain(
			"worker-no-node-observability-families",
		);
	});
});

afterEach(async () => {
	await Promise.all(
		fixtureRoots
			.splice(0)
			.map((fixtureRoot) => rm(fixtureRoot, { recursive: true, force: true })),
	);
});
