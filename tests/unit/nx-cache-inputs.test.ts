import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { expect, it } from "vitest";
import { z } from "zod";

const rootDir = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const nxCliPath = join(
	dirname(require.resolve("nx/package.json")),
	"dist",
	"bin",
	"nx.js",
);

const nxInputSchema = z.union([
	z.string().transform((pattern) => ({ kind: "pattern" as const, pattern })),
	z.object({ runtime: z.string() }).transform(({ runtime }) => ({
		kind: "runtime" as const,
		command: runtime,
	})),
	z.object({ env: z.string() }).transform(({ env }) => ({
		kind: "environment" as const,
		name: env,
	})),
]);

const nxConfigurationSchema = z.object({
	namedInputs: z.record(z.string(), z.array(nxInputSchema)),
});

const projectConfigurationSchema = z.object({
	targets: z.record(
		z.string(),
		z.object({ inputs: z.array(nxInputSchema).optional() }),
	),
});

type NxInput = z.infer<typeof nxInputSchema>;
type NxConfiguration = z.infer<typeof nxConfigurationSchema>;
type ProjectConfiguration = z.infer<typeof projectConfigurationSchema>;

function serializeNxInput(
	input: NxInput,
): string | { runtime: string } | { env: string } {
	if (input.kind === "pattern") return input.pattern;
	if (input.kind === "runtime") return { runtime: input.command };
	return { env: input.name };
}

const nxSource = await readConfigurationSource("nx.json");
const nxConfigurationValue: unknown = JSON.parse(nxSource);
const nxConfiguration = nxConfigurationSchema.parse(nxConfigurationValue);
const projectConfiguration = readEffectiveProjectConfiguration();

function readConfigurationSource(fileName: string): Promise<string> {
	return readFile(
		fileURLToPath(new URL(`../../${fileName}`, import.meta.url)),
		"utf8",
	);
}

function readEffectiveProjectConfiguration(): ProjectConfiguration {
	const result = spawnSync(
		process.execPath,
		[nxCliPath, "show", "project", "repository", "--json"],
		{
			cwd: rootDir,
			encoding: "utf8",
			env: { ...process.env, NX_DAEMON: "false" },
		},
	);
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			result.stderr || "Nx could not resolve the repository project",
		);
	}
	return projectConfigurationSchema.parse(JSON.parse(result.stdout));
}

function resolveInputs(
	inputs: readonly NxInput[],
	namedInputs: NxConfiguration["namedInputs"],
	ancestors: ReadonlySet<string> = new Set(),
): NxInput[] {
	const resolved: NxInput[] = [];
	for (const input of inputs) {
		if (input.kind !== "pattern" || !namedInputs[input.pattern]) {
			resolved.push(input);
			continue;
		}
		if (ancestors.has(input.pattern)) {
			throw new Error(`Cyclic Nx named input reference: ${input.pattern}`);
		}
		const nextAncestors = new Set(ancestors);
		nextAncestors.add(input.pattern);
		for (const nestedInput of resolveInputs(
			namedInputs[input.pattern],
			namedInputs,
			nextAncestors,
		)) {
			resolved.push(nestedInput);
		}
	}
	return resolved;
}

function globPatternMatchesFile(pattern: string, filePath: string): boolean {
	const workspacePattern = pattern.replace(/^\{workspaceRoot\}\//, "");
	let expression = "";
	for (let index = 0; index < workspacePattern.length; index += 1) {
		const character = workspacePattern[index];
		if (character === "*" && workspacePattern[index + 1] === "*") {
			index += 2;
			if (workspacePattern[index] === "/") {
				expression += "(?:.*/)?";
				continue;
			}
			expression += ".*";
			continue;
		}
		if (character === "*") {
			expression += "[^/]*";
			continue;
		}
		expression += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
	}
	return new RegExp(`^${expression}$`).test(filePath);
}

function targetInputs(
	targetName: string,
	nx: NxConfiguration = nxConfiguration,
): NxInput[] {
	const inputs = projectConfiguration.targets[targetName]?.inputs;
	if (!inputs) throw new Error(`Missing Nx target inputs: ${targetName}`);
	return resolveInputs(inputs, nx.namedInputs);
}

function targetTracksFile(
	targetName: string,
	filePath: string,
	nx: NxConfiguration = nxConfiguration,
): boolean {
	return targetInputs(targetName, nx).some(
		(input) =>
			input.kind === "pattern" &&
			globPatternMatchesFile(input.pattern, filePath),
	);
}

type NxCacheFixture = {
	readonly cacheDirectory: string;
	readonly markerPath: string;
	readonly rootDirectory: string;
};

function createNxCacheFixture(): NxCacheFixture {
	const fixtureDirectory = mkdtempSync(join(tmpdir(), "hevy-nx-cache-inputs-"));
	const rootDirectory = join(fixtureDirectory, "workspace");
	const cacheDirectory = join(fixtureDirectory, "nx-cache");
	const markerPath = join(fixtureDirectory, "executions.log");
	mkdirSync(rootDirectory, { recursive: true });

	const workerPath = join(rootDirectory, "packages/worker/src/worker.ts");
	const setupPath = join(rootDirectory, "tests/setup/cloudflare-runtime.ts");
	const unrelatedPath = join(rootDirectory, "docs/test-lanes.md");
	for (const [path, contents] of [
		[workerPath, "export const workerFixture = 1;\n"],
		[setupPath, "export const setupFixture = 1;\n"],
		[unrelatedPath, "# Test lanes\n"],
	] as const) {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, contents, "utf8");
	}

	const runnerPath = join(rootDirectory, "record-execution.mjs");
	writeFileSync(
		runnerPath,
		'import { appendFileSync } from "node:fs";\nappendFileSync(process.argv[2], "x");\n',
		"utf8",
	);
	writeFileSync(
		join(rootDirectory, "package.json"),
		JSON.stringify({ name: "nx-cache-input-fixture", version: "0.0.0" }),
		"utf8",
	);
	writeFileSync(
		join(rootDirectory, "nx.json"),
		JSON.stringify({
			namedInputs: Object.fromEntries(
				Object.entries(nxConfiguration.namedInputs).map(([name, inputs]) => [
					name,
					inputs.map(serializeNxInput),
				]),
			),
		}),
		"utf8",
	);
	const contractInputs = projectConfiguration.targets["test:contract"]?.inputs;
	if (!contractInputs)
		throw new Error("Missing effective contract target inputs");
	const command = `${JSON.stringify(process.execPath)} ${JSON.stringify(runnerPath)} ${JSON.stringify(markerPath)}`;
	writeFileSync(
		join(rootDirectory, "project.json"),
		JSON.stringify({
			name: "repository",
			root: ".",
			targets: {
				"cache-probe": {
					executor: "nx:run-commands",
					cache: true,
					inputs: contractInputs.map(serializeNxInput),
					options: { command },
				},
			},
		}),
		"utf8",
	);
	symlinkSync(
		join(rootDir, "node_modules"),
		join(rootDirectory, "node_modules"),
		"dir",
	);

	return { cacheDirectory, markerPath, rootDirectory };
}

function runNxCacheFixtureTarget(fixture: NxCacheFixture): void {
	const result = spawnSync(
		process.execPath,
		[
			nxCliPath,
			"run",
			"repository:cache-probe",
			"--outputStyle=static",
			"--skipRemoteCache",
		],
		{
			cwd: fixture.rootDirectory,
			encoding: "utf8",
			env: {
				...process.env,
				NX_CACHE_DIRECTORY: fixture.cacheDirectory,
				NX_DAEMON: "false",
			},
		},
	);
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			result.stderr || result.stdout || "Nx cache fixture target failed",
		);
	}
}

function executionCount(markerPath: string): number {
	return existsSync(markerPath) ? readFileSync(markerPath, "utf8").length : 0;
}

it("tracks Worker sources and shared Node Vitest setup dependencies", () => {
	for (const targetName of [
		"test:unit",
		"test:release-unit",
		"test:mcp",
		"test:contract",
		"test:worker",
	]) {
		expect(targetTracksFile(targetName, "packages/worker/src/worker.ts")).toBe(
			true,
		);
	}

	for (const targetName of [
		"test:unit",
		"test:release-unit",
		"test:mcp",
		"test:contract",
		"test:stdio",
		"test:cli",
	]) {
		expect(
			targetTracksFile(targetName, "tests/setup/cloudflare-runtime.ts"),
		).toBe(true);
		expect(targetTracksFile(targetName, "vitest.config.ts")).toBe(true);
	}

	for (const targetName of [
		"test:unit",
		"test:release-unit",
		"test:mcp",
		"test:contract",
		"test:cli",
	]) {
		expect(
			targetTracksFile(targetName, "tests/shims/cloudflare-workers.ts"),
		).toBe(true);
	}

	expect(
		targetTracksFile(
			"test:worker",
			"tests/cloudflare/worker.integration.test.ts",
		),
	).toBe(true);
	expect(targetTracksFile("test:worker", "vitest.workers.config.ts")).toBe(
		true,
	);
	expect(targetTracksFile("test:worker", "vitest.config.ts")).toBe(false);
	expect(
		targetTracksFile("test:worker", "tests/setup/cloudflare-runtime.ts"),
	).toBe(false);
	expect(targetTracksFile("test:worker", "wrangler.test.jsonc")).toBe(true);
});

it("detects missing Worker, setup, and shim inputs in configuration fixtures", () => {
	const missingWorkerSource = structuredClone(nxConfiguration);
	missingWorkerSource.namedInputs.contractTests =
		missingWorkerSource.namedInputs.contractTests.filter(
			(input) => input.kind !== "pattern" || input.pattern !== "workerSources",
		);
	expect(
		targetTracksFile(
			"test:contract",
			"packages/worker/src/worker.ts",
			missingWorkerSource,
		),
	).toBe(false);

	const missingSetup = structuredClone(nxConfiguration);
	missingSetup.namedInputs.unitTests =
		missingSetup.namedInputs.unitTests.filter(
			(input) =>
				input.kind !== "pattern" || input.pattern !== "nodeVitestInputs",
		);
	expect(
		targetTracksFile(
			"test:unit",
			"tests/setup/cloudflare-runtime.ts",
			missingSetup,
		),
	).toBe(false);
	const missingCliSetup = structuredClone(nxConfiguration);
	missingCliSetup.namedInputs.cliTests =
		missingCliSetup.namedInputs.cliTests.filter(
			(input) =>
				input.kind !== "pattern" || input.pattern !== "nodeVitestInputs",
		);
	expect(
		targetTracksFile(
			"test:cli",
			"tests/setup/cloudflare-runtime.ts",
			missingCliSetup,
		),
	).toBe(false);

	const missingShim = structuredClone(nxConfiguration);
	missingShim.namedInputs.unitTests = missingShim.namedInputs.unitTests.filter(
		(input) => input.kind !== "pattern" || input.pattern !== "testShims",
	);
	expect(
		targetTracksFile(
			"test:unit",
			"tests/shims/cloudflare-workers.ts",
			missingShim,
		),
	).toBe(false);
	const missingCliShim = structuredClone(nxConfiguration);
	missingCliShim.namedInputs.cliTests =
		missingCliShim.namedInputs.cliTests.filter(
			(input) => input.kind !== "pattern" || input.pattern !== "testShims",
		);
	expect(
		targetTracksFile(
			"test:cli",
			"tests/shims/cloudflare-workers.ts",
			missingCliShim,
		),
	).toBe(false);
});

it("retains Node-version and report-mode cache dimensions", () => {
	for (const targetName of [
		"test:unit",
		"test:release-unit",
		"test:mcp",
		"test:contract",
		"test:stdio",
		"test:worker",
		"test:cli",
	]) {
		expect(
			targetInputs(targetName).some((input) => input.kind === "runtime"),
		).toBe(true);
	}
	for (const targetName of ["test:unit", "test:mcp"]) {
		expect(
			targetInputs(targetName).some(
				(input) =>
					input.kind === "environment" &&
					input.name === "HEVY_TEST_REPORT_MODE",
			),
		).toBe(true);
	}
});

it("does not hash unrelated documentation for focused test lanes", () => {
	expect(targetTracksFile("test:unit", "docs/architecture.md")).toBe(false);
	expect(targetTracksFile("test:contract", "docs/architecture.md")).toBe(false);
	expect(targetTracksFile("test:unit", "vitest.workers.config.ts")).toBe(false);
	expect(targetTracksFile("test:worker", "vitest.config.ts")).toBe(false);
	expect(targetTracksFile("test:cli", "vitest.config.ts")).toBe(true);
	expect(
		targetTracksFile("test:cli", "tests/setup/cloudflare-runtime.ts"),
	).toBe(true);
});

it("uses Nx cache hashing for Worker and setup changes but ignores unrelated docs", () => {
	const fixture = createNxCacheFixture();
	const workerPath = join(
		fixture.rootDirectory,
		"packages/worker/src/worker.ts",
	);
	const setupPath = join(
		fixture.rootDirectory,
		"tests/setup/cloudflare-runtime.ts",
	);
	const unrelatedPath = join(fixture.rootDirectory, "docs/test-lanes.md");
	try {
		runNxCacheFixtureTarget(fixture);
		expect(executionCount(fixture.markerPath)).toBe(1);
		runNxCacheFixtureTarget(fixture);
		expect(executionCount(fixture.markerPath)).toBe(1);

		writeFileSync(workerPath, "export const workerFixture = 2;\n", "utf8");
		runNxCacheFixtureTarget(fixture);
		expect(executionCount(fixture.markerPath)).toBe(2);
		writeFileSync(workerPath, "export const workerFixture = 1;\n", "utf8");
		runNxCacheFixtureTarget(fixture);
		expect(executionCount(fixture.markerPath)).toBe(2);

		writeFileSync(setupPath, "export const setupFixture = 2;\n", "utf8");
		runNxCacheFixtureTarget(fixture);
		expect(executionCount(fixture.markerPath)).toBe(3);
		writeFileSync(setupPath, "export const setupFixture = 1;\n", "utf8");
		runNxCacheFixtureTarget(fixture);
		expect(executionCount(fixture.markerPath)).toBe(3);

		writeFileSync(unrelatedPath, "# Unrelated documentation change\n", "utf8");
		runNxCacheFixtureTarget(fixture);
		expect(executionCount(fixture.markerPath)).toBe(3);
	} finally {
		rmSync(dirname(fixture.rootDirectory), { force: true, recursive: true });
	}
}, 30_000);
