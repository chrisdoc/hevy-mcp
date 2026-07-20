import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runServerManifest } from "../../scripts/server-manifest.mjs";

const rootDir = resolve(import.meta.dirname, "../..");
const serverManifestScript = join(rootDir, "scripts/server-manifest.mjs");
const fixtureDirs = new Set<string>();
let cliImportId = 0;

interface PackageFixture {
	files: string[];
	mcpName: string;
	name: string;
	version: string;
}

interface ManifestFixture {
	name: string;
	packages: Array<{
		environmentVariables: Array<{ isSecret: boolean }>;
		identifier: string;
		registryType: string;
		transport?: { type: string };
		version: string;
	}>;
	version: string;
}

const invalidPackageCases: Array<
	[string, (packageJson: PackageFixture) => void, string]
> = [
	[
		"mcpName",
		(packageJson) => {
			packageJson.mcpName = "invalid/name";
		},
		"package.json mcpName",
	],
	[
		"version",
		(packageJson) => {
			packageJson.version = "";
		},
		"package.json version",
	],
	[
		"files",
		(packageJson) => {
			packageJson.files = [];
		},
		"package.json files",
	],
];

const invalidManifestCases: Array<
	[string, (manifest: ManifestFixture) => void, string]
> = [
	[
		"missing package entry",
		(manifest) => {
			manifest.packages = [];
		},
		"server.json must contain exactly one package",
	],
	[
		"non-npm package entry",
		(manifest) => {
			manifest.packages[0].registryType = "oci";
		},
		"server.json package registryType must be npm",
	],
	[
		"missing stdio transport",
		(manifest) => {
			delete manifest.packages[0].transport;
		},
		"server.json package transport must be stdio",
	],
	[
		"missing environment variable",
		(manifest) => {
			manifest.packages[0].environmentVariables = [];
		},
		"server.json package must declare exactly one environment variable",
	],
	[
		"invalid API key metadata",
		(manifest) => {
			manifest.packages[0].environmentVariables[0].isSecret = false;
		},
		"server.json has unexpected HEVY_API_KEY metadata",
	],
];

afterEach(async () => {
	await Promise.all(
		[...fixtureDirs].map((fixtureDir) =>
			rm(fixtureDir, { force: true, recursive: true }),
		),
	);
	fixtureDirs.clear();
});

async function writeJson(path: string, value: unknown) {
	await writeFile(path, `${JSON.stringify(value, null, "\t")}\n`);
}

async function runCli(mode: string, cwd: string) {
	const originalArgv = [...process.argv];
	const originalCwd = process.cwd();
	const originalExitCode = process.exitCode;
	const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
	const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

	try {
		process.argv[1] = serverManifestScript;
		process.argv[2] = mode;
		process.chdir(cwd);
		process.exitCode = undefined;
		cliImportId += 1;
		await import(
			`${pathToFileURL(serverManifestScript).href}?test=${cliImportId}`
		);
		return {
			exitCode: process.exitCode,
			stderr: error.mock.calls.flat().join("\n"),
			stdout: log.mock.calls.flat().join("\n"),
		};
	} finally {
		process.argv.splice(0, process.argv.length, ...originalArgv);
		process.chdir(originalCwd);
		process.exitCode = originalExitCode;
		log.mockRestore();
		error.mockRestore();
	}
}

async function createFixture() {
	const fixtureDir = await mkdtemp(join(tmpdir(), "hevy-server-manifest-"));
	fixtureDirs.add(fixtureDir);
	const packageJson: PackageFixture = JSON.parse(
		await readFile(join(rootDir, "package.json"), "utf8"),
	);
	const manifest: ManifestFixture = JSON.parse(
		await readFile(join(rootDir, "server.json"), "utf8"),
	);

	await writeJson(join(fixtureDir, "package.json"), packageJson);
	await writeJson(join(fixtureDir, "server.json"), manifest);

	return { fixtureDir, manifest, packageJson };
}

describe("server manifest metadata", () => {
	it("matches package metadata and is included in the npm package", async () => {
		const packageJson = JSON.parse(
			await readFile(join(rootDir, "package.json"), "utf8"),
		);
		const manifest = JSON.parse(
			await readFile(join(rootDir, "server.json"), "utf8"),
		);

		expect(packageJson.files).toContain("server.json");
		expect(manifest.name).toBe(packageJson.mcpName);
		expect(manifest.version).toBe(packageJson.version);
		expect(manifest.packages).toHaveLength(1);
		expect(manifest.packages[0]).toMatchObject({
			identifier: packageJson.name,
			registryType: "npm",
			transport: { type: "stdio" },
			version: packageJson.version,
		});
		expect(manifest.packages[0].environmentVariables).toContainEqual(
			expect.objectContaining({
				isRequired: true,
				isSecret: true,
				name: "HEVY_API_KEY",
			}),
		);
	});

	it("reports version drift without changing the manifest in check mode", async () => {
		const { fixtureDir, manifest, packageJson } = await createFixture();
		packageJson.version = "9.8.7";
		await writeJson(join(fixtureDir, "package.json"), packageJson);
		const before = await readFile(join(fixtureDir, "server.json"), "utf8");

		await expect(
			runServerManifest({ mode: "check", rootDir: fixtureDir }),
		).rejects.toThrow("version, packages[0].version");
		expect(await readFile(join(fixtureDir, "server.json"), "utf8")).toBe(
			before,
		);
		expect(manifest.version).not.toBe(packageJson.version);
	});

	it("repairs drift and reports the manifest as changed", async () => {
		const { fixtureDir, manifest, packageJson } = await createFixture();
		manifest.name = "io.github.example/drifted";
		manifest.version = "9.8.7";
		manifest.packages[0].identifier = "drifted-package";
		manifest.packages[0].version = "9.8.7";
		await writeJson(join(fixtureDir, "server.json"), manifest);
		const result = await runServerManifest({
			mode: "sync",
			rootDir: fixtureDir,
		});
		const contents = await readFile(join(fixtureDir, "server.json"), "utf8");
		const updatedManifest = JSON.parse(contents);

		expect(result.drift).toEqual([
			"name",
			"version",
			"packages[0].identifier",
			"packages[0].version",
		]);
		expect(result.changed).toBe(true);
		expect(result.changed).toBe(result.drift.length > 0);
		expect(contents).toBe(`${JSON.stringify(updatedManifest, null, "\t")}\n`);
		expect(updatedManifest).toEqual({
			...manifest,
			name: packageJson.mcpName,
			version: packageJson.version,
			packages: [
				{
					...manifest.packages[0],
					identifier: packageJson.name,
					version: packageJson.version,
				},
			],
		});
	});

	it("does not rewrite an already synchronized manifest", async () => {
		const { fixtureDir } = await createFixture();
		const result = await runServerManifest({
			mode: "sync",
			rootDir: fixtureDir,
		});

		expect(result).toEqual({ changed: false, drift: [] });
	});

	it("rejects malformed invariant metadata instead of overwriting it", async () => {
		const { fixtureDir, manifest } = await createFixture();
		manifest.packages[0].transport = { type: "sse" };
		await writeJson(join(fixtureDir, "server.json"), manifest);

		await expect(
			runServerManifest({ mode: "sync", rootDir: fixtureDir }),
		).rejects.toThrow("package transport must be stdio");
	});

	it.each([
		["package.json", "package.json is not valid JSON"],
		["server.json", "server.json is not valid JSON"],
	])("reports malformed JSON in %s", async (fileName, message) => {
		const { fixtureDir } = await createFixture();
		await writeFile(join(fixtureDir, fileName), "{not-json\n");

		await expect(
			runServerManifest({ mode: "check", rootDir: fixtureDir }),
		).rejects.toThrow(message);
	});

	it("reports unreadable manifest inputs", async () => {
		const { fixtureDir } = await createFixture();
		await rm(join(fixtureDir, "server.json"));

		await expect(
			runServerManifest({ mode: "check", rootDir: fixtureDir }),
		).rejects.toThrow("Unable to read server.json");
	});

	it.each(invalidPackageCases)(
		"rejects invalid package metadata in %s",
		async (_field, mutatePackageJson, message) => {
			const { fixtureDir, packageJson } = await createFixture();
			mutatePackageJson(packageJson);
			await writeJson(join(fixtureDir, "package.json"), packageJson);

			await expect(
				runServerManifest({ mode: "sync", rootDir: fixtureDir }),
			).rejects.toThrow(message);
		},
	);

	it.each(invalidManifestCases)(
		"rejects a manifest with %s",
		async (_case, mutateManifest, message) => {
			const { fixtureDir, manifest } = await createFixture();
			mutateManifest(manifest);
			await writeJson(join(fixtureDir, "server.json"), manifest);

			await expect(
				runServerManifest({ mode: "sync", rootDir: fixtureDir }),
			).rejects.toThrow(message);
		},
	);

	it("rejects invalid API and CLI modes before reading files", async () => {
		await expect(
			// @ts-expect-error Runtime validation rejects unsupported JavaScript callers.
			runServerManifest({ mode: "invalid", rootDir: "/does-not-exist" }),
		).rejects.toThrow('expected "check" or "sync"');

		const result = await runCli("invalid", rootDir);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain('expected "check" or "sync"');
	});

	it("prints whether CLI sync changed the manifest", async () => {
		const { fixtureDir, manifest } = await createFixture();
		const checkResult = await runCli("check", fixtureDir);
		expect(checkResult).toMatchObject({
			exitCode: undefined,
			stdout: "server.json is synchronized with package.json.",
		});

		manifest.version = "9.8.7";
		await writeJson(join(fixtureDir, "server.json"), manifest);
		const syncResult = await runCli("sync", fixtureDir);
		expect(syncResult).toMatchObject({
			exitCode: undefined,
			stdout: "Synchronized server.json with package.json.",
		});
	});
});
