import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(
	new URL("./check-package-changesets.mjs", import.meta.url).href,
);
const fixtureDirectories = new Set<string>();
const fixtureGitIdentity = {
	GIT_AUTHOR_NAME: "Test User",
	GIT_AUTHOR_EMAIL: "test@example.com",
	GIT_COMMITTER_NAME: "Test User",
	GIT_COMMITTER_EMAIL: "test@example.com",
} as const;

function fixtureGitEnvironment(root: string): NodeJS.ProcessEnv {
	const environment = Object.fromEntries(
		Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
	);

	return {
		...environment,
		GIT_CONFIG_GLOBAL: join(root, ".gitconfig"),
		GIT_CONFIG_NOSYSTEM: "1",
		...fixtureGitIdentity,
	};
}

async function git(root: string, ...args: string[]) {
	return execFileAsync("git", args, {
		cwd: root,
		env: fixtureGitEnvironment(root),
	});
}

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

async function commitFixture(root: string) {
	await git(root, "add", "--all");
	await git(root, "commit", "--quiet", "-m", "test: change fixture");
}

async function writeChangeset(root: string, packages: string[]) {
	await writeChangesetWithBumps(
		root,
		Object.fromEntries(packages.map((packageName) => [packageName, "patch"])),
	);
}

async function writeChangesetWithBumps(
	root: string,
	releases: Record<string, "major" | "minor" | "patch">,
) {
	await writeFixtureFile(
		root,
		".changeset/new.md",
		`---\n${Object.entries(releases)
			.map(([packageName, bump]) => `"${packageName}": ${bump}`)
			.join("\n")}\n---\n\nRuntime package release.\n`,
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

	await writeFixtureFile(
		root,
		"scripts/check-package-changesets.mjs",
		await readFile(scriptPath, "utf8"),
	);
	for (const relativePath of [
		"scripts/repository-control-plane.mjs",
		"scripts/control-plane-models.mjs",
		"scripts/control-plane-validation.mjs",
		"scripts/runtime-value-predicates.mjs",
		"repository/topology.json",
		"repository/artifact-provenance.json",
		"repository/validation-lanes.json",
	]) {
		await writeFixtureFile(
			root,
			relativePath,
			await readFile(
				join(fileURLToPath(new URL("..", import.meta.url).href), relativePath),
				"utf8",
			),
		);
	}
	await writeFixtureFile(
		root,
		`${packagePath}/package.json`,
		JSON.stringify({ name: packageName }) + "\n",
	);
	await writeFixtureFile(
		root,
		`${packagePath}/src/index.js`,
		'export const value = "base";\n',
	);
	await writeFixtureFile(root, ".changeset/README.md", "# Changesets\n");
	await writeFixtureFile(
		root,
		"cloudflare.config.ts",
		'export const workerName = "base";\n',
	);
	if (options.existingChangeset) {
		await writeFixtureFile(
			root,
			".changeset/existing.md",
			'---\n"@example/pkg": patch\n---\n\nExisting release note.\n',
		);
	}

	await git(root, "init", "--quiet");
	await git(root, "add", ".");
	await git(root, "commit", "--quiet", "-m", "test: create fixture");
	const { stdout } = await git(root, "rev-parse", "HEAD");

	return { base: stdout.trim(), root };
}

async function runCheck(root: string, base: string) {
	try {
		const result = await execFileAsync(
			process.execPath,
			[join(root, "scripts/check-package-changesets.mjs"), "--since", base],
			{ cwd: root, env: fixtureGitEnvironment(root) },
		);
		return {
			exitCode: 0,
			stderr: result.stderr,
			stdout: result.stdout,
		};
	} catch (error) {
		const failure = error as {
			code: number;
			stderr: string;
			stdout: string;
		};
		return {
			exitCode: failure.code,
			stderr: failure.stderr,
			stdout: failure.stdout,
		};
	}
}

describe("package changeset coverage", () => {
	it("does not persist fixture commit identity in Git config", async () => {
		const { root } = await createFixture();

		await expect(
			git(root, "config", "--local", "--get", "user.name"),
		).rejects.toMatchObject({ code: 1 });

		await expect(
			git(root, "config", "--global", "--get", "user.name"),
		).rejects.toMatchObject({ code: 1 });
	});
	it("does not let a base-branch changeset cover a PR package change", async () => {
		const { base, root } = await createFixture({ existingChangeset: true });
		await writeFixtureFile(
			root,
			"packages/example/src/index.js",
			'export const value = "changed";\n',
		);
		await commitFixture(root);

		const result = await runCheck(root, base);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain(
			"Changed workspace packages need a changeset added or modified by this branch",
		);
	});

	it("does not let a rename-only changeset cover a PR package change", async () => {
		const { base, root } = await createFixture({ existingChangeset: true });
		await writeFixtureFile(
			root,
			"packages/example/src/index.js",
			'export const value = "changed";\n',
		);
		await git(root, "mv", ".changeset/existing.md", ".changeset/renamed.md");
		await commitFixture(root);

		const result = await runCheck(root, base);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain(
			"Changed workspace packages need a changeset added or modified by this branch",
		);
	});

	it("rejects an empty changeset for a workspace package change", async () => {
		const { base, root } = await createFixture();
		await writeFixtureFile(
			root,
			"packages/example/src/index.js",
			'export const value = "changed";\n',
		);
		await writeFixtureFile(
			root,
			".changeset/empty.md",
			"---\n---\n\nNo release.\n",
		);
		await commitFixture(root);

		const result = await runCheck(root, base);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain(
			"Empty Changesets cannot accompany release-triggering changes",
		);
		expect(result.stderr).toContain(".changeset/empty.md");
	});

	it("rejects an empty changeset alongside a matching bump", async () => {
		const { base, root } = await createFixture();
		await writeFixtureFile(
			root,
			"packages/example/src/index.js",
			'export const value = "changed";\n',
		);
		await writeFixtureFile(
			root,
			".changeset/bump.md",
			'---\n"@example/pkg": patch\n---\n\nRelease change.\n',
		);
		await writeFixtureFile(
			root,
			".changeset/empty.md",
			"---\n---\n\nNo release.\n",
		);
		await commitFixture(root);

		const result = await runCheck(root, base);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain(
			"Empty Changesets cannot accompany release-triggering changes",
		);
		expect(result.stderr).toContain(".changeset/empty.md");
	});

	it("accepts an empty changeset for a root-level no-release change", async () => {
		const { base, root } = await createFixture();
		await writeFixtureFile(root, "CONTRIBUTING.md", "No release.\n");
		await writeFixtureFile(
			root,
			".changeset/empty.md",
			"---\n---\n\nNo release.\n",
		);
		await commitFixture(root);

		const result = await runCheck(root, base);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(
			"No workspace package changes require a package changeset",
		);
	});

	it("requires a changeset for deletion-only package changes", async () => {
		const { base, root } = await createFixture();
		await rm(join(root, "packages/example/src/index.js"));
		await commitFixture(root);

		const result = await runCheck(root, base);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("packages/example -> @example/pkg");
	});

	it("resolves a fully deleted package name from the base revision", async () => {
		const { base, root } = await createFixture();
		await rm(join(root, "packages/example"), { recursive: true });
		await commitFixture(root);

		const result = await runCheck(root, base);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("packages/example -> @example/pkg");
	});

	it("accepts a matching changeset added by the branch", async () => {
		const { base, root } = await createFixture({ existingChangeset: true });
		await writeFixtureFile(
			root,
			"packages/example/src/index.js",
			'export const value = "changed";\n',
		);
		await writeFixtureFile(
			root,
			".changeset/new.md",
			'---\n"@example/pkg": patch\n---\n\nNew release note.\n',
		);
		await commitFixture(root);

		const result = await runCheck(root, base);

		expect(result.exitCode).toBe(0);
	});

	it("lists every missing transitive consumer for a client release", async () => {
		const { base, root } = await createFixture({
			packageName: "@hevy-mcp/hevy-client",
			packagePath: "packages/hevy-client",
		});
		await writeFixtureFile(
			root,
			"packages/hevy-client/src/index.js",
			'export const value = "changed";\n',
		);
		await writeChangeset(root, [
			"@hevy-mcp/hevy-client",
			"@hevy-mcp/operations",
			"@hevy-mcp/core",
			"hevy-mcp",
		]);
		await commitFixture(root);

		const result = await runCheck(root, base);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("@hevy-mcp/hevy-client");
		expect(result.stderr).toContain("@hevy-mcp/worker");
		expect(result.stderr).toContain("@chrisdoc/hevy-cli");
	});

	it("accepts the complete client release cascade", async () => {
		const { base, root } = await createFixture({
			packageName: "@hevy-mcp/hevy-client",
			packagePath: "packages/hevy-client",
		});
		await writeFixtureFile(
			root,
			"packages/hevy-client/src/index.js",
			'export const value = "changed";\n',
		);
		await writeChangeset(root, [
			"@hevy-mcp/hevy-client",
			"@hevy-mcp/operations",
			"@hevy-mcp/core",
			"hevy-mcp",
			"@hevy-mcp/worker",
			"@chrisdoc/hevy-cli",
		]);
		await commitFixture(root);

		expect((await runCheck(root, base)).exitCode).toBe(0);
	});

	it("allows patch consumer bumps for a major client release", async () => {
		const { base, root } = await createFixture({
			packageName: "@hevy-mcp/hevy-client",
			packagePath: "packages/hevy-client",
		});
		await writeFixtureFile(
			root,
			"packages/hevy-client/src/index.js",
			'export const value = "changed";\n',
		);
		await writeChangesetWithBumps(root, {
			"@hevy-mcp/hevy-client": "major",
			"@hevy-mcp/operations": "patch",
			"@hevy-mcp/core": "patch",
			"hevy-mcp": "patch",
			"@hevy-mcp/worker": "patch",
			"@chrisdoc/hevy-cli": "patch",
		});
		await commitFixture(root);

		expect((await runCheck(root, base)).exitCode).toBe(0);
	});

	it("lists missing shipped consumers for a core release", async () => {
		const { base, root } = await createFixture({
			packageName: "@hevy-mcp/core",
			packagePath: "packages/core",
		});
		await writeFixtureFile(
			root,
			"packages/core/src/index.js",
			'export const value = "changed";\n',
		);
		await writeChangeset(root, ["@hevy-mcp/core", "hevy-mcp"]);
		await commitFixture(root);

		const result = await runCheck(root, base);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("@hevy-mcp/worker");
		expect(result.stderr).toContain("@chrisdoc/hevy-cli");
	});

	it("accepts the complete core release cascade", async () => {
		const { base, root } = await createFixture({
			packageName: "@hevy-mcp/core",
			packagePath: "packages/core",
		});
		await writeFixtureFile(
			root,
			"packages/core/src/index.js",
			'export const value = "changed";\n',
		);
		await writeChangeset(root, [
			"@hevy-mcp/core",
			"hevy-mcp",
			"@hevy-mcp/worker",
			"@chrisdoc/hevy-cli",
		]);
		await commitFixture(root);

		expect((await runCheck(root, base)).exitCode).toBe(0);
	});

	it.each([
		["hevy-mcp", "packages/node"],
		["@hevy-mcp/worker", "packages/worker"],
		["@chrisdoc/hevy-cli", "packages/cli"],
	])("accepts an isolated %s release", async (packageName, packagePath) => {
		const { base, root } = await createFixture({ packageName, packagePath });
		await writeFixtureFile(
			root,
			`${packagePath}/src/index.js`,
			'export const value = "changed";\n',
		);
		await writeChangeset(root, [packageName]);
		await commitFixture(root);

		expect((await runCheck(root, base)).exitCode).toBe(0);
	});

	it.each([
		["hevy-mcp", "packages/node", "@hevy-mcp/worker"],
		["@hevy-mcp/worker", "packages/worker", "hevy-mcp"],
		["@chrisdoc/hevy-cli", "packages/cli", "hevy-mcp"],
	])(
		"rejects %s changes coupled to an unrelated release",
		async (packageName, packagePath, unrelatedPackage) => {
			const { base, root } = await createFixture({
				packageName,
				packagePath,
			});
			await writeFixtureFile(
				root,
				`${packagePath}/src/index.js`,
				'export const value = "changed";\n',
			);
			await writeChangeset(root, [packageName, unrelatedPackage]);
			await commitFixture(root);

			const result = await runCheck(root, base);

			expect(result.exitCode).not.toBe(0);
			expect(result.stderr).toContain(
				"Changesets must not couple unrelated package releases",
			);
			expect(result.stderr).toContain(unrelatedPackage);
		},
	);

	it("requires a Worker release for production Worker config changes", async () => {
		const { base, root } = await createFixture();
		await writeFixtureFile(
			root,
			"cloudflare.config.ts",
			'export const workerName = "changed";\n',
		);
		await writeChangeset(root, []);
		await commitFixture(root);

		const result = await runCheck(root, base);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("cloudflare.config.ts -> @hevy-mcp/worker");
	});

	it("accepts a Worker release for production Worker config changes", async () => {
		const { base, root } = await createFixture();
		await writeFixtureFile(
			root,
			"cloudflare.config.ts",
			'export const workerName = "changed";\n',
		);
		await writeChangeset(root, ["@hevy-mcp/worker"]);
		await commitFixture(root);

		expect((await runCheck(root, base)).exitCode).toBe(0);
	});
});
