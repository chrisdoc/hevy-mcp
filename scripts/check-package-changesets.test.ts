import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { packageChangesetCoverage } from "./check-package-changesets.mjs";

const fixtureDirectories = new Set<string>();
const repositoryRoot = resolve(import.meta.dirname, "..");

afterEach(async () => {
	await Promise.all(
		Array.from(fixtureDirectories, (directory) =>
			rm(directory, { recursive: true, force: true }),
		),
	);
	fixtureDirectories.clear();
});

async function writeFixtureFile(root: string, path: string, contents: string) {
	const target = join(root, path);
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, contents);
}

function changesetFrontmatter(
	releases: Record<string, "major" | "minor" | "patch">,
	summary: string,
): string {
	return `---\n${Object.entries(releases)
		.map(([packageName, bump]) => `"${packageName}": ${bump}`)
		.join("\n")}\n---\n\n${summary}\n`;
}

async function writeChangeset(
	root: string,
	packages: string[],
	bumps: Record<string, "major" | "minor" | "patch"> = {},
) {
	const releases: Record<string, "major" | "minor" | "patch"> = {};
	for (const packageName of packages) {
		releases[packageName] = bumps[packageName] ?? "patch";
	}
	Object.assign(releases, bumps);
	await writeFixtureFile(
		root,
		".changeset/new.md",
		changesetFrontmatter(releases, "Runtime package release."),
	);
}

async function createFixture(
	options: {
		existingChangeset?: boolean;
		packageName?: string;
		packagePath?: string;
	} = {},
) {
	const root = await mkdtemp(join(tmpdir(), "hevy-package-changesets-"));
	fixtureDirectories.add(root);
	const packageName = options.packageName ?? "@example/pkg";
	const packagePath = options.packagePath ?? "packages/example";

	// Base revision state, used for the deleted-manifest fallback.
	const base = new Map<string, string>();
	const put = async (path: string, contents: string) => {
		base.set(path, contents);
		await writeFixtureFile(root, path, contents);
	};

	await put(
		`${packagePath}/package.json`,
		JSON.stringify({ name: packageName }) + "\n",
	);
	await put(`${packagePath}/src/index.js`, 'export const value = "base";\n');
	await put(
		"repository/topology.json",
		await readFile(join(repositoryRoot, "repository/topology.json"), "utf8"),
	);
	await put(".changeset/README.md", "# Changesets\n");
	if (options.existingChangeset) {
		await put(
			".changeset/existing.md",
			'---\n"@example/pkg": patch\n---\n\nExisting release note.\n',
		);
	}

	return {
		root,
		packageName,
		packagePath,
		readManifestFromBase: (changedPackagePath: string) =>
			base.get(`${changedPackagePath}/package.json`),
	};
}

function runCheck(
	fixture: Awaited<ReturnType<typeof createFixture>>,
	options: {
		changedFiles?: string[];
		changesetDiffLines?: string[];
	} = {},
) {
	return packageChangesetCoverage({
		root: fixture.root,
		changedFiles: options.changedFiles ?? [],
		changesetDiffLines: options.changesetDiffLines ?? [],
		readManifestFromBase: fixture.readManifestFromBase,
	});
}

describe("package changeset coverage", () => {
	it("does not let a base-branch changeset cover a PR package change", async () => {
		const fixture = await createFixture({ existingChangeset: true });
		await writeFixtureFile(
			fixture.root,
			"packages/example/src/index.js",
			'export const value = "changed";\n',
		);

		await expect(
			runCheck(fixture, {
				changedFiles: ["packages/example/src/index.js"],
			}),
		).rejects.toThrow(
			"Changed workspace packages need a changeset added or modified by this branch",
		);
	});

	it("does not let a rename-only changeset cover a PR package change", async () => {
		const fixture = await createFixture({ existingChangeset: true });
		await writeFixtureFile(
			fixture.root,
			"packages/example/src/index.js",
			'export const value = "changed";\n',
		);
		await rm(join(fixture.root, ".changeset/existing.md"));
		await writeFixtureFile(
			fixture.root,
			".changeset/renamed.md",
			'---\n"@example/pkg": patch\n---\n\nExisting release note.\n',
		);

		await expect(
			runCheck(fixture, {
				changedFiles: ["packages/example/src/index.js"],
				changesetDiffLines: [
					"R100\t.changeset/existing.md\t.changeset/renamed.md",
				],
			}),
		).rejects.toThrow(
			"Changed workspace packages need a changeset added or modified by this branch",
		);
	});

	it("rejects an empty changeset for a workspace package change", async () => {
		const fixture = await createFixture();
		await writeFixtureFile(
			fixture.root,
			"packages/example/src/index.js",
			'export const value = "changed";\n',
		);
		await writeFixtureFile(
			fixture.root,
			".changeset/empty.md",
			"---\n---\n\nNo release.\n",
		);

		await expect(
			runCheck(fixture, {
				changedFiles: ["packages/example/src/index.js"],
				changesetDiffLines: ["A\t.changeset/empty.md"],
			}),
		).rejects.toThrow(
			/Empty Changesets cannot accompany release-triggering changes[\s\S]*\.changeset\/empty\.md/,
		);
	});

	it("rejects an empty changeset alongside a matching bump", async () => {
		const fixture = await createFixture();
		await writeFixtureFile(
			fixture.root,
			"packages/example/src/index.js",
			'export const value = "changed";\n',
		);
		await writeFixtureFile(
			fixture.root,
			".changeset/bump.md",
			'---\n"@example/pkg": patch\n---\n\nRelease change.\n',
		);
		await writeFixtureFile(
			fixture.root,
			".changeset/empty.md",
			"---\n---\n\nNo release.\n",
		);

		await expect(
			runCheck(fixture, {
				changedFiles: ["packages/example/src/index.js"],
				changesetDiffLines: ["A\t.changeset/bump.md", "A\t.changeset/empty.md"],
			}),
		).rejects.toThrow(
			"Empty Changesets cannot accompany release-triggering changes",
		);
	});

	it("accepts an empty changeset for a root-level no-release change", async () => {
		const fixture = await createFixture();
		await writeFixtureFile(fixture.root, "CONTRIBUTING.md", "No release.\n");
		await writeFixtureFile(
			fixture.root,
			".changeset/empty.md",
			"---\n---\n\nNo release.\n",
		);

		await expect(
			runCheck(fixture, {
				changedFiles: ["CONTRIBUTING.md"],
				changesetDiffLines: ["A\t.changeset/empty.md"],
			}),
		).resolves.toEqual({ changedPackageCount: 0 });
	});

	it("requires a changeset for deletion-only package changes", async () => {
		const fixture = await createFixture();
		await rm(join(fixture.root, "packages/example/src/index.js"));

		await expect(
			runCheck(fixture, {
				changedFiles: ["packages/example/src/index.js"],
			}),
		).rejects.toThrow("packages/example -> @example/pkg");
	});

	it("resolves a fully deleted package name from the base revision", async () => {
		const fixture = await createFixture();
		await rm(join(fixture.root, "packages/example"), {
			recursive: true,
		});

		await expect(
			runCheck(fixture, {
				changedFiles: [
					"packages/example/package.json",
					"packages/example/src/index.js",
				],
			}),
		).rejects.toThrow("packages/example -> @example/pkg");
	});

	it("accepts a matching changeset added by the branch", async () => {
		const fixture = await createFixture({ existingChangeset: true });
		await writeFixtureFile(
			fixture.root,
			"packages/example/src/index.js",
			'export const value = "changed";\n',
		);
		await writeFixtureFile(
			fixture.root,
			".changeset/new.md",
			'---\n"@example/pkg": patch\n---\n\nNew release note.\n',
		);

		await expect(
			runCheck(fixture, {
				changedFiles: ["packages/example/src/index.js"],
				changesetDiffLines: ["A\t.changeset/new.md"],
			}),
		).resolves.toEqual({ changedPackageCount: 1 });
	});

	it("lists every missing transitive consumer for a client release", async () => {
		const fixture = await createFixture({
			packageName: "@hevy-mcp/hevy-client",
			packagePath: "packages/hevy-client",
		});
		await writeFixtureFile(
			fixture.root,
			"packages/hevy-client/src/index.js",
			'export const value = "changed";\n',
		);
		await writeChangeset(fixture.root, [
			"@hevy-mcp/hevy-client",
			"@hevy-mcp/operations",
			"@hevy-mcp/core",
			"hevy-mcp",
		]);

		await expect(
			runCheck(fixture, {
				changedFiles: ["packages/hevy-client/src/index.js"],
				changesetDiffLines: ["A\t.changeset/new.md"],
			}),
		).rejects.toThrow(
			/@hevy-mcp\/worker[\s\S]*@chrisdoc\/hevy-cli|@chrisdoc\/hevy-cli[\s\S]*@hevy-mcp\/worker/,
		);
	});

	it("accepts the complete client release cascade", async () => {
		const fixture = await createFixture({
			packageName: "@hevy-mcp/hevy-client",
			packagePath: "packages/hevy-client",
		});
		await writeFixtureFile(
			fixture.root,
			"packages/hevy-client/src/index.js",
			'export const value = "changed";\n',
		);
		await writeChangeset(fixture.root, [
			"@hevy-mcp/hevy-client",
			"@hevy-mcp/operations",
			"@hevy-mcp/core",
			"hevy-mcp",
			"@hevy-mcp/worker",
			"@chrisdoc/hevy-cli",
		]);

		await expect(
			runCheck(fixture, {
				changedFiles: ["packages/hevy-client/src/index.js"],
				changesetDiffLines: ["A\t.changeset/new.md"],
			}),
		).resolves.toEqual({ changedPackageCount: 1 });
	});

	it("allows patch consumer bumps for a major client release", async () => {
		const fixture = await createFixture({
			packageName: "@hevy-mcp/hevy-client",
			packagePath: "packages/hevy-client",
		});
		await writeFixtureFile(
			fixture.root,
			"packages/hevy-client/src/index.js",
			'export const value = "changed";\n',
		);
		await writeChangeset(fixture.root, ["@hevy-mcp/hevy-client"], {
			"@hevy-mcp/hevy-client": "major",
			"@hevy-mcp/operations": "patch",
			"@hevy-mcp/core": "patch",
			"hevy-mcp": "patch",
			"@hevy-mcp/worker": "patch",
			"@chrisdoc/hevy-cli": "patch",
		});

		await expect(
			runCheck(fixture, {
				changedFiles: ["packages/hevy-client/src/index.js"],
				changesetDiffLines: ["A\t.changeset/new.md"],
			}),
		).resolves.toEqual({ changedPackageCount: 1 });
	});

	it("lists missing shipped consumers for a core release", async () => {
		const fixture = await createFixture({
			packageName: "@hevy-mcp/core",
			packagePath: "packages/core",
		});
		await writeFixtureFile(
			fixture.root,
			"packages/core/src/index.js",
			'export const value = "changed";\n',
		);
		await writeChangeset(fixture.root, ["@hevy-mcp/core", "hevy-mcp"]);

		await expect(
			runCheck(fixture, {
				changedFiles: ["packages/core/src/index.js"],
				changesetDiffLines: ["A\t.changeset/new.md"],
			}),
		).rejects.toThrow(
			/@hevy-mcp\/worker[\s\S]*@chrisdoc\/hevy-cli|@chrisdoc\/hevy-cli[\s\S]*@hevy-mcp\/worker/,
		);
	});

	it("accepts the complete core release cascade", async () => {
		const fixture = await createFixture({
			packageName: "@hevy-mcp/core",
			packagePath: "packages/core",
		});
		await writeFixtureFile(
			fixture.root,
			"packages/core/src/index.js",
			'export const value = "changed";\n',
		);
		await writeChangeset(fixture.root, [
			"@hevy-mcp/core",
			"hevy-mcp",
			"@hevy-mcp/worker",
			"@chrisdoc/hevy-cli",
		]);

		await expect(
			runCheck(fixture, {
				changedFiles: ["packages/core/src/index.js"],
				changesetDiffLines: ["A\t.changeset/new.md"],
			}),
		).resolves.toEqual({ changedPackageCount: 1 });
	});

	it.each([
		["hevy-mcp", "packages/node"],
		["@hevy-mcp/worker", "packages/worker"],
		["@chrisdoc/hevy-cli", "packages/cli"],
	])("accepts an isolated %s release", async (packageName, packagePath) => {
		const fixture = await createFixture({ packageName, packagePath });
		await writeFixtureFile(
			fixture.root,
			`${packagePath}/src/index.js`,
			'export const value = "changed";\n',
		);
		await writeChangeset(fixture.root, [packageName]);

		await expect(
			runCheck(fixture, {
				changedFiles: [`${packagePath}/src/index.js`],
				changesetDiffLines: ["A\t.changeset/new.md"],
			}),
		).resolves.toEqual({ changedPackageCount: 1 });
	});

	it.each([
		["hevy-mcp", "packages/node", "@hevy-mcp/worker"],
		["@hevy-mcp/worker", "packages/worker", "hevy-mcp"],
		["@chrisdoc/hevy-cli", "packages/cli", "hevy-mcp"],
	])(
		"rejects %s changes coupled to an unrelated release",
		async (packageName, packagePath, unrelatedPackage) => {
			const fixture = await createFixture({ packageName, packagePath });
			await writeFixtureFile(
				fixture.root,
				`${packagePath}/src/index.js`,
				'export const value = "changed";\n',
			);
			await writeChangeset(fixture.root, [packageName, unrelatedPackage]);

			const failure = await runCheck(fixture, {
				changedFiles: [`${packagePath}/src/index.js`],
				changesetDiffLines: ["A\t.changeset/new.md"],
			}).catch((error: Error) => error);

			expect(failure).toBeInstanceOf(Error);
			expect((failure as Error).message).toContain(
				"Changesets must not couple unrelated package releases",
			);
			expect((failure as Error).message).toContain(unrelatedPackage);
		},
	);

	it("requires a Worker release for production Worker config changes", async () => {
		const fixture = await createFixture();
		await writeFixtureFile(
			fixture.root,
			"cloudflare.config.ts",
			'export const workerName = "changed";\n',
		);
		await writeChangeset(fixture.root, []);

		await expect(
			runCheck(fixture, {
				changedFiles: ["cloudflare.config.ts"],
				changesetDiffLines: ["A\t.changeset/new.md"],
			}),
		).rejects.toThrow("cloudflare.config.ts -> @hevy-mcp/worker");
	});

	it("accepts a Worker release for production Worker config changes", async () => {
		const fixture = await createFixture();
		await writeFixtureFile(
			fixture.root,
			"cloudflare.config.ts",
			'export const workerName = "changed";\n',
		);
		await writeChangeset(fixture.root, ["@hevy-mcp/worker"]);

		await expect(
			runCheck(fixture, {
				changedFiles: ["cloudflare.config.ts"],
				changesetDiffLines: ["A\t.changeset/new.md"],
			}),
		).resolves.toEqual({ changedPackageCount: 1 });
	});
});
