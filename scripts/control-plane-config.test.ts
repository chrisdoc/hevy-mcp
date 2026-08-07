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
	"check",
	"check:types",
	"check:changeset",
	"check:server-manifest",
	"build",
	"build:client",
	"test:unit",
	"test:release-unit",
	"test:mcp",
	"test:integration",
	"test:diagnostics",
	"test:contract",
	"test:stdio",
	"test:worker",
	"test:worker-http",
	"test:worker-http:live",
	"test:pack",
	"test:cli",
	"test:pack:cli",
	"test:nightly",
	"test:live",
	"measure:tokens",
	"worker:dry-run",
	"test:performance",
] as const;

const baselineRootScriptCount = 58;
const maximumRootScriptCount = Math.floor(baselineRootScriptCount * 0.7);
const removedRootScripts = [
	"inspect:npm",
	"update-dependencies",
	"test:coverage",
	"build:standalone",
	"check:exports",
	"check:package-changesets",
	"sync:server-manifest",
	"check:dependency-cruiser",
	"nx:affected",
	"nx:control-plane",
	"version:patch",
	"version:minor",
	"version:major",
	"commit",
	"check:publint",
	"version:changesets",
	"release",
	"worker:deploy",
] as const;

const projectOwnedCommands = {
	"check:exports": "node scripts/check-package-exports.mjs",
	"check:package-changesets": "node scripts/check-package-changesets.mjs",
	"sync:server-manifest": "node scripts/server-manifest.mjs sync",
	"check:publint":
		"publint run --strict --pack npm packages/node && publint run --strict --pack npm packages/cli",
	"version:changesets":
		"changeset version && node scripts/server-manifest.mjs sync",
	release: "changeset publish",
	"worker:deploy":
		"cross-env WRANGLER_MODE=production wrangler deploy --x-new-config --env production",
} as const;

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
	it("declares the canonical model check as an explicit target", async () => {
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as { targets: Record<string, { inputs?: string[] }> };

		expect(project.targets["check:control-plane"]?.inputs).toEqual([
			"controlPlaneInputs",
		]);
	});

	it("keeps contributor-facing targets as inferred root npm scripts", async () => {
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

	it("reduces the root script surface by at least thirty percent", async () => {
		const packageJson = JSON.parse(
			await readFile(resolve(root, "package.json"), "utf8"),
		) as { scripts: Record<string, string> };

		expect(Object.keys(packageJson.scripts).length).toBeLessThanOrEqual(
			maximumRootScriptCount,
		);
		expect(maximumRootScriptCount).toBe(40);
		for (const script of removedRootScripts)
			expect(packageJson.scripts).not.toHaveProperty(script);
	});

	it("keeps internal commands on explicit Nx targets", async () => {
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as {
			targets: Record<
				string,
				{
					cache?: boolean;
					executor?: string;
					inputs?: string[];
					options?: { command?: string };
					outputs?: string[];
				}
			>;
		};
		const packageJson = JSON.parse(
			await readFile(resolve(root, "package.json"), "utf8"),
		) as { scripts: Record<string, string> };

		for (const [target, command] of Object.entries(projectOwnedCommands)) {
			expect(packageJson.scripts).not.toHaveProperty(target);
			expect(project.targets[target]).toMatchObject({
				executor: "nx:run-commands",
				options: { command },
			});
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

	it("runs strict Publint against both public package workspaces", async () => {
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
					parallelism?: boolean;
				}
			>;
		};
		const packageJson = JSON.parse(
			await readFile(resolve(root, "package.json"), "utf8"),
		) as { scripts: Record<string, string> };

		expect(packageJson.scripts).not.toHaveProperty("check:publint");
		expect(project.targets["check:publint"]).toMatchObject({
			executor: "nx:run-commands",
			options: {
				command:
					"publint run --strict --pack npm packages/node && publint run --strict --pack npm packages/cli",
			},
			cache: false,
			dependsOn: ["build", "@chrisdoc/hevy-cli:build"],
			parallelism: false,
		});
	});

	it("keeps dependency-cruiser inside the package-boundary check", async () => {
		const packageJson = JSON.parse(
			await readFile(resolve(root, "package.json"), "utf8"),
		) as { scripts: Record<string, string> };

		expect(packageJson.scripts).not.toHaveProperty("check:dependency-cruiser");
		expect(packageJson.scripts["check:boundaries"]).toBe(
			"node scripts/check-package-boundaries.mjs && depcruise --config .dependency-cruiser.cjs packages",
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
			"env -u GIT_DIR -u GIT_WORK_TREE changeset status --since=origin/main && env -u GIT_DIR -u GIT_WORK_TREE node scripts/check-package-changesets.mjs --since origin/main",
		);
		expect(packageJson.scripts["check:changeset"]).not.toContain("npm run");
	});

	it("declares the control-plane aggregate as a no-op target", async () => {
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as { targets: Record<string, { executor?: string }> };

		expect(project.targets["control-plane"]?.executor).toBe("nx:noop");
	});

	it("builds both publishable packages before packing artifacts", async () => {
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
		expect(pack?.dependsOn).toEqual(
			expect.arrayContaining(["hevy-mcp:build", "@chrisdoc/hevy-cli:build"]),
		);
		expect(pack?.cache).toBe(false);
		expect(pack?.options?.command).toBeUndefined();
		expect(pack?.options?.commands).toEqual([
			"node -e \"require('node:fs').mkdirSync('.nx/pack', { recursive: true })\"",
			"npm pack --workspace=hevy-mcp --workspace=@chrisdoc/hevy-cli --pack-destination .nx/pack --ignore-scripts --silent",
		]);
		expect(pack?.options?.parallel).toBe(false);
	});

	it("keeps cached targets on explicit narrow named inputs", async () => {
		const nx = JSON.parse(await readFile(resolve(root, "nx.json"), "utf8")) as {
			namedInputs: Record<string, unknown>;
			targetDefaults: Record<
				string,
				| { cache?: boolean; inputs?: string[] }
				| Array<{
						cache?: boolean;
						inputs?: string[];
						dependsOn?: string[];
				  }>
			>;
		};
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as {
			targets: Record<string, { cache?: boolean; inputs?: string[] }>;
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
		const assertNamedInputsResolve = (inputs: string[] | undefined) => {
			for (const input of inputs ?? []) {
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
			"release",
			"worker:deploy",
		]) {
			expect(project.targets[target]?.cache).toBe(false);
		}
		for (const target of [
			"test:worker",
			"test:worker-http",
			"test:pack",
			"test:pack:cli",
		]) {
			expect(project.targets[target]?.parallelism).toBe(false);
		}
		expect(project.targets["test:pack:cli"]?.options).toBeUndefined();
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
