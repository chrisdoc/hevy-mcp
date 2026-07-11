import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const rootDir = resolve(import.meta.dirname, "../..");
const runtimeSupportScript = join(rootDir, "scripts/runtime-support.mjs");
const execFileAsync = promisify(execFile);
const fixtureDirs = new Set<string>();

afterEach(async () => {
	await Promise.all(
		[...fixtureDirs].map((fixtureDir) =>
			rm(fixtureDir, { force: true, recursive: true }),
		),
	);
	fixtureDirs.clear();
});

async function createFixture() {
	const fixtureDir = await mkdtemp(join(tmpdir(), "hevy-runtime-support-"));
	fixtureDirs.add(fixtureDir);
	await cp(rootDir, fixtureDir, {
		filter: (source) => {
			const relative = source.slice(rootDir.length + 1);
			return (
				relative === "" ||
				relative === "package.json" ||
				relative === "package-lock.json" ||
				relative === ".nvmrc" ||
				relative === ".github" ||
				relative === ".github/workflows" ||
				relative === ".github/workflows/build-and-test.yml"
			);
		},
		recursive: true,
	});
	return fixtureDir;
}

async function editJson(
	fixtureDir: string,
	fileName: string,
	mutate: (value: Record<string, unknown>) => void,
) {
	const path = join(fixtureDir, fileName);
	const value = JSON.parse(await readFile(path, "utf8"));
	mutate(value);
	await writeFile(path, `${JSON.stringify(value, null, "\t")}\n`);
}

async function runRuntimeSupport(cwd: string) {
	return execFileAsync(process.execPath, [runtimeSupportScript], { cwd });
}

describe("runtime support policy", () => {
	it("aligns the canonical package, development, and CI declarations", async () => {
		const result = await runRuntimeSupport(rootDir);
		expect(result.stderr).toBe("");
		expect(result.stdout).toContain(
			"Node 24 primary, Node 26 npm-package compatibility",
		);
	});

	it("rejects package-lock engine drift", async () => {
		const fixtureDir = await createFixture();
		await editJson(fixtureDir, "package-lock.json", (packageLock) => {
			const packages = packageLock.packages as Record<
				string,
				{ engines: { node: string } }
			>;
			packages[""].engines.node = ">=24";
		});

		await expect(runRuntimeSupport(fixtureDir)).rejects.toMatchObject({
			stderr: expect.stringContaining("package-lock.json root engines.node"),
		});
	});

	it("rejects a development major outside the primary lane", async () => {
		const fixtureDir = await createFixture();
		await writeFile(join(fixtureDir, ".nvmrc"), "26\n");

		await expect(runRuntimeSupport(fixtureDir)).rejects.toMatchObject({
			stderr: expect.stringContaining(
				".nvmrc must select the primary Node major 24",
			),
		});
	});

	it("rejects missing or mislabeled CI support lanes", async () => {
		const fixtureDir = await createFixture();
		const workflowPath = join(
			fixtureDir,
			".github/workflows/build-and-test.yml",
		);
		const workflow = await readFile(workflowPath, "utf8");
		await writeFile(
			workflowPath,
			workflow.replace(
				'support-level: "npm-package compatibility"',
				'support-level: "primary"',
			),
		);

		await expect(runRuntimeSupport(fixtureDir)).rejects.toMatchObject({
			stderr: expect.stringContaining("CI runtime support must be"),
		});
	});
});
