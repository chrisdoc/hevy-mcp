import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runServerManifest } from "../../scripts/server-manifest.mjs";

const rootDir = resolve(import.meta.dirname, "../..");

async function createFixture() {
	const fixtureDir = await mkdtemp(join(tmpdir(), "hevy-server-manifest-"));
	const packageJson = JSON.parse(
		await readFile(join(rootDir, "package.json"), "utf8"),
	);
	const manifest = JSON.parse(
		await readFile(join(rootDir, "server.json"), "utf8"),
	);

	await writeFile(
		join(fixtureDir, "package.json"),
		`${JSON.stringify(packageJson, null, "\t")}\n`,
	);
	await writeFile(
		join(fixtureDir, "server.json"),
		`${JSON.stringify(manifest, null, "\t")}\n`,
	);

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
		await writeFile(
			join(fixtureDir, "package.json"),
			`${JSON.stringify(packageJson, null, "\t")}\n`,
		);
		const before = await readFile(join(fixtureDir, "server.json"), "utf8");

		await expect(
			runServerManifest({ mode: "check", rootDir: fixtureDir }),
		).rejects.toThrow("version, packages[0].version");
		expect(await readFile(join(fixtureDir, "server.json"), "utf8")).toBe(
			before,
		);
		expect(manifest.version).not.toBe(packageJson.version);
	});

	it("synchronizes only package-derived fields with stable formatting", async () => {
		const { fixtureDir, manifest, packageJson } = await createFixture();
		manifest.name = "io.github.example/drifted";
		manifest.version = "9.8.7";
		manifest.packages[0].identifier = "drifted-package";
		manifest.packages[0].version = "9.8.7";
		await writeFile(
			join(fixtureDir, "server.json"),
			`${JSON.stringify(manifest, null, "\t")}\n`,
		);
		const result = await runServerManifest({
			mode: "sync",
			rootDir: fixtureDir,
		});
		const contents = await readFile(join(fixtureDir, "server.json"), "utf8");
		const updatedManifest = JSON.parse(contents);

		expect(result.changed).toBe(true);
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
		manifest.packages[0].transport.type = "sse";
		await writeFile(
			join(fixtureDir, "server.json"),
			`${JSON.stringify(manifest, null, "\t")}\n`,
		);

		await expect(
			runServerManifest({ mode: "sync", rootDir: fixtureDir }),
		).rejects.toThrow("package transport must be stdio");
	});
});
