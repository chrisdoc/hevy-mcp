import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { cruise, format, type IFlattenedRuleSet } from "dependency-cruiser";
import { afterEach, describe, expect, it } from "vitest";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const require = createRequire(import.meta.url);
type ControlPlaneRuleSet = IFlattenedRuleSet & {
	forbidden: NonNullable<IFlattenedRuleSet["forbidden"]>;
};
const dependencyCruiserConfig = require(
	resolve(root, ".dependency-cruiser.cjs"),
) as ControlPlaneRuleSet;

const metadata = require(resolve(root, "scripts/nx-project-metadata.cjs")) as {
	projectTags(packageJson: Record<string, unknown>): string[];
};

const inferredTargets = [
	"check:workspaces",
	"check:boundaries",
	"check:exports",
	"check:release-candidates",
	"check:package-changesets",
	"check",
	"check:types",
	"check:changeset",
	"build",
	"build:client",
	"sync:server-manifest",
	"test:coverage",
	"test:performance",
] as const;

const aggregateTargets = [
	"check:workspaces",
	"check:boundaries",
	"check:exports",
	"test:pr",
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

describe("Nx and dependency-cruiser control-plane spike", () => {
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

	it("keeps test:pr as a single environment-setting npm wrapper", async () => {
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as {
			targets: Record<
				string,
				{ options?: { command?: string; env?: Record<string, string> } }
			>;
		};
		const testPr = project.targets["test:pr"];
		expect(testPr?.options?.command).toBe("npm run test:pr");
		expect(testPr?.options?.command).not.toContain("test:unit &&");
		expect(testPr?.options?.env).toEqual({ FORCE_COLOR: "0" });
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
		expect(aggregate).not.toContain("check:release-candidates");
		expect(aggregate).not.toContain("check:package-changesets");
		expect(packageJson.scripts["check:changeset"]).toContain(
			"node scripts/check-release-candidates.mjs",
		);
		expect(packageJson.scripts["check:changeset"]).toContain(
			"npm run check:package-changesets",
		);
	});

	it("builds both publishable packages before packing artifacts", async () => {
		const project = JSON.parse(
			await readFile(resolve(root, "project.json"), "utf8"),
		) as { targets: Record<string, { dependsOn?: string[]; cache?: boolean }> };
		const pack = project.targets["pack:artifacts"];
		expect(pack?.dependsOn).toEqual(
			expect.arrayContaining(["hevy-mcp:build", "@chrisdoc/hevy-cli:build"]),
		);
		expect(pack?.cache).toBe(false);
	});

	it("declares outputs for cached package builds", async () => {
		const nx = JSON.parse(await readFile(resolve(root, "nx.json"), "utf8")) as {
			targetDefaults: {
				build: { outputs?: string[] };
			};
		};

		expect(nx.targetDefaults.build.outputs).toEqual(["{projectRoot}/dist"]);
	});

	it("derives exact tags for every current package manifest", async () => {
		const expected = {
			cli: ["runtime:node", "publishability:public", "role:cli"],
			core: ["runtime:neutral", "publishability:private", "role:runtime"],
			"hevy-client": [
				"runtime:neutral",
				"publishability:private",
				"role:client",
			],
			node: ["runtime:node", "publishability:public", "role:server"],
			worker: ["runtime:workerd", "publishability:private", "role:adapter"],
		} as const;
		for (const [directory, tags] of Object.entries(expected)) {
			const packageJson = JSON.parse(
				await readFile(
					resolve(root, "packages", directory, "package.json"),
					"utf8",
				),
			);
			expect(metadata.projectTags(packageJson)).toEqual(tags);
		}
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
