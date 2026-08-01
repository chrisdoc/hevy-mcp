import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(
	new URL("./check-package-changesets.mjs", import.meta.url),
);
const fixtureDirectories = new Set<string>();

afterEach(async () => {
	await Promise.all(
		[...fixtureDirectories].map((directory) =>
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

async function git(root: string, ...args: string[]) {
	return execFileAsync("git", args, { cwd: root });
}

async function commitFixture(root: string) {
	await git(root, "add", "--all");
	await git(root, "commit", "--quiet", "-m", "test: change fixture");
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
	if (options.existingChangeset) {
		await writeFixtureFile(
			root,
			".changeset/existing.md",
			'---\n"@example/pkg": patch\n---\n\nExisting release note.\n',
		);
	}

	await git(root, "init", "--quiet");
	await mkdir(join(root, ".git-hooks"), { recursive: true });
	await git(root, "config", "core.hooksPath", ".git-hooks");
	await git(root, "config", "user.name", "Test User");
	await git(root, "config", "user.email", "test@example.com");
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
			{ cwd: root },
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

	it.each([
		["@hevy-mcp/core", "packages/core"],
		["@hevy-mcp/hevy-client", "packages/hevy-client"],
	])(
		"requires hevy-mcp when %s is released",
		async (packageName, packagePath) => {
			const { base, root } = await createFixture({
				packageName,
				packagePath,
			});
			await writeFixtureFile(
				root,
				`${packagePath}/src/index.js`,
				'export const value = "changed";\n',
			);
			await writeFixtureFile(
				root,
				".changeset/new.md",
				`---\n"${packageName}": patch\n---\n\nRuntime package release.\n`,
			);
			await commitFixture(root);

			const result = await runCheck(root, base);

			expect(result.exitCode).not.toBe(0);
			expect(result.stderr).toContain(
				"must also release hevy-mcp because those packages are bundled",
			);
		},
	);
});
