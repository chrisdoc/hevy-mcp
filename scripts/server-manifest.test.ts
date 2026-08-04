import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runServerManifest } from "./server-manifest.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const nodePackagePath = join(rootDir, "packages/node/package.json");
const fixtureDirs = new Set<string>();

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

async function createFixture() {
	const fixtureDir = await mkdtemp(join(tmpdir(), "hevy-server-manifest-"));
	fixtureDirs.add(fixtureDir);
	const packageJson: PackageFixture = JSON.parse(
		await readFile(nodePackagePath, "utf8"),
	);
	const manifest: ManifestFixture = JSON.parse(
		await readFile(join(rootDir, "server.json"), "utf8"),
	);

	await writeJson(join(fixtureDir, "package.json"), packageJson);
	await writeJson(join(fixtureDir, "server.json"), manifest);

	return { fixtureDir, manifest, packageJson };
}

describe("server manifest provenance", () => {
	it("uses artifact provenance for package and manifest output paths", async () => {
		const { fixtureDir, manifest, packageJson } = await createFixture();
		const metadataDir = join(fixtureDir, "metadata");
		await mkdir(metadataDir);
		const provenance: {
			sources: Array<{ id: string; paths: string[] }>;
			outputs: Array<{ id: string; paths: string[] }>;
		} = JSON.parse(
			await readFile(
				join(rootDir, "repository/artifact-provenance.json"),
				"utf8",
			),
		);
		const nodePackageSource = provenance.sources.find(
			(entry) => entry.id === "node-package-manifest",
		);
		if (!nodePackageSource) throw new Error("node package source is missing");
		nodePackageSource.paths = ["metadata/node-package.json"];
		const serverManifestOutput = provenance.outputs.find(
			(entry) => entry.id === "server-manifest",
		);
		if (!serverManifestOutput)
			throw new Error("server manifest output is missing");
		serverManifestOutput.paths = [
			"metadata/server.json",
			"metadata/server-copy.json",
		];
		const pluginManifestOutput = provenance.outputs.find(
			(entry) => entry.id === "plugin-manifest",
		);
		if (!pluginManifestOutput)
			throw new Error("plugin manifest output is missing");
		pluginManifestOutput.paths = [
			"metadata/plugin.json",
			"metadata/plugin-copy.json",
		];
		await mkdir(join(fixtureDir, "repository"));
		await writeJson(
			join(fixtureDir, "repository/artifact-provenance.json"),
			provenance,
		);
		packageJson.version = "9.8.7";
		manifest.version = "1.0.0";
		manifest.packages[0].version = "1.0.0";
		await writeJson(
			join(fixtureDir, "metadata/node-package.json"),
			packageJson,
		);
		await writeJson(join(fixtureDir, "metadata/server.json"), manifest);
		await writeJson(join(fixtureDir, "metadata/server-copy.json"), manifest);
		await writeJson(join(fixtureDir, "metadata/plugin.json"), {
			version: "1.0.0",
		});
		await writeJson(join(fixtureDir, "metadata/plugin-copy.json"), {
			version: "1.0.0",
		});

		const result = await runServerManifest({
			mode: "sync",
			rootDir: fixtureDir,
		});
		expect(result.drift).toEqual([
			"version",
			"packages[0].version",
			"metadata/plugin.json",
			"metadata/plugin-copy.json",
		]);
		expect(
			JSON.parse(await readFile(join(metadataDir, "server-copy.json"), "utf8")),
		).toEqual(
			JSON.parse(await readFile(join(metadataDir, "server.json"), "utf8")),
		);
		expect(
			JSON.parse(await readFile(join(metadataDir, "plugin.json"), "utf8")),
		).toEqual({
			version: "9.8.7",
		});
		expect(
			JSON.parse(await readFile(join(metadataDir, "plugin-copy.json"), "utf8")),
		).toEqual({
			version: "9.8.7",
		});
	});
});
