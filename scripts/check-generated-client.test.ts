import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	compareDirectoryTrees,
	checkGeneratedClient,
	findCuratedBarrelDrift,
	findForbiddenRootSourceFiles,
} from "./check-generated-client.mjs";

const fixtureRoot = resolve(
	import.meta.dirname,
	"../tests/fixtures/generated-client",
);

// Keep the intentionally invalid sources inert for repository-wide checks.
async function materializeFixture(sourceRoot: string) {
	const targetRoot = await mkdtemp(
		resolve(tmpdir(), "hevy-generated-client-fixture-"),
	);

	async function copyTree(sourceDirectory: string, targetDirectory: string) {
		for (const entry of await readdir(sourceDirectory, {
			withFileTypes: true,
		})) {
			const sourcePath = resolve(sourceDirectory, entry.name);
			const targetName = entry.isFile()
				? entry.name.replace(/\.fixture$/, "")
				: entry.name;
			const targetPath = resolve(targetDirectory, targetName);

			if (entry.isDirectory()) {
				await mkdir(targetPath, { recursive: true });
				await copyTree(sourcePath, targetPath);
			} else {
				await cp(sourcePath, targetPath);
			}
		}
	}

	try {
		await copyTree(sourceRoot, targetRoot);
		return targetRoot;
	} catch (error) {
		await rm(targetRoot, { recursive: true, force: true });
		throw error;
	}
}

describe("generated client closure checks", () => {
	it("returns no differences when both comparison trees are absent", async () => {
		const root = await mkdtemp(
			resolve(tmpdir(), "hevy-generated-client-empty-trees-"),
		);
		try {
			expect(
				await compareDirectoryTrees(
					resolve(root, "expected"),
					resolve(root, "actual"),
				),
			).toEqual([]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("propagates non-directory comparison errors", async () => {
		const root = await mkdtemp(
			resolve(tmpdir(), "hevy-generated-client-not-directory-"),
		);
		const file = resolve(root, "not-a-directory");
		try {
			await writeFile(file, "fixture");
			await expect(compareDirectoryTrees(file, file)).rejects.toMatchObject({
				code: "ENOTDIR",
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("reports stale generated output", async () => {
		const drift = await compareDirectoryTrees(
			resolve(fixtureRoot, "stale/expected"),
			resolve(fixtureRoot, "stale/actual"),
		);

		expect(drift).toEqual([
			"generated file differs: client/types/index.ts",
			"missing generated file: client/types/Routine.ts",
			"unexpected generated file: client/types/Workout.ts",
		]);
	});

	it("reports a forbidden root src tree", async () => {
		const sourceFiles = await findForbiddenRootSourceFiles(
			resolve(fixtureRoot, "forbidden-root"),
		);

		expect(sourceFiles).toEqual(["src/generated/index.ts"]);
	});

	it("handles absent, empty, and non-directory root src paths", async () => {
		const root = await mkdtemp(
			resolve(tmpdir(), "hevy-generated-client-root-src-"),
		);
		try {
			expect(await findForbiddenRootSourceFiles(root)).toEqual([]);

			await mkdir(resolve(root, "src"));
			expect(await findForbiddenRootSourceFiles(root)).toEqual(["src"]);

			await rm(resolve(root, "src"), { recursive: true, force: true });
			await writeFile(resolve(root, "src"), "fixture");
			expect(await findForbiddenRootSourceFiles(root)).toEqual(["src"]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("keeps the curated barrels closed over generated output", async () => {
		expect(
			await findCuratedBarrelDrift(
				resolve(import.meta.dirname, "../packages/hevy-client"),
			),
		).toEqual([]);
	});

	it("reports missing curated barrels and traversal targets", async () => {
		const root = await mkdtemp(
			resolve(tmpdir(), "hevy-generated-client-barrel-drift-"),
		);
		try {
			await mkdir(resolve(root, "src/generated"), { recursive: true });
			await writeFile(
				resolve(root, "src/types.ts"),
				'export type { Escaped } from "./generated/../escape.js";\n',
			);

			const failures = await findCuratedBarrelDrift(root);
			expect(failures).toContain("missing curated barrel: src/schemas.ts");
			expect(failures).toContain(
				"src/types.ts: missing generated target ./generated/../escape.js",
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("regenerates the checked client without drift", async () => {
		const result = await checkGeneratedClient();

		expect(result.generatedFiles).toBeGreaterThan(0);
	}, 20_000);

	it("reports a missing named public export", async () => {
		const fixture = await materializeFixture(
			resolve(fixtureRoot, "stale-public-export"),
		);
		try {
			const drift = await findCuratedBarrelDrift(fixture);

			expect(drift).toHaveLength(1);
			expect(drift[0]).toMatch(
				/has no exported member ['"]MissingPublicType['"]/,
			);
			expect(drift.join("\n")).not.toContain("missing curated barrel");
		} finally {
			await rm(fixture, { recursive: true, force: true });
		}
	});
});
