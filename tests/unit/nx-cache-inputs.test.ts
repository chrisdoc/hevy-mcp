import { readFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { expect, it } from "vitest";
import { z } from "zod";

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

const [nxSource, projectSource] = await Promise.all([
	readConfigurationSource("nx.json"),
	readConfigurationSource("project.json"),
]);
const nxConfigurationValue: unknown = JSON.parse(nxSource);
const projectConfigurationValue: unknown = JSON.parse(projectSource);
const nxConfiguration = nxConfigurationSchema.parse(nxConfigurationValue);
const projectConfiguration = projectConfigurationSchema.parse(
	projectConfigurationValue,
);

async function readConfigurationSource(fileName: string): Promise<string> {
	return readFile(
		fileURLToPath(new URL(`../../${fileName}`, import.meta.url)),
		"utf8",
	);
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
	expect(targetTracksFile("test:cli", "vitest.config.ts")).toBe(false);
	expect(
		targetTracksFile("test:cli", "tests/setup/cloudflare-runtime.ts"),
	).toBe(false);
});
