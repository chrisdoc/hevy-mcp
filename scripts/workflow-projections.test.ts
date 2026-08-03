import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadValidationLanes } from "./repository-control-plane.mjs";
import {
	assertWorkflowProjection,
	parseWorkflowLaneExecutions,
} from "./workflow-projections.mjs";

const buildWorkflowPath = ".github/workflows/build-and-test.yml";
const releaseWorkflowPath = ".github/workflows/release.yml";

async function currentProjection(source = readFile(buildWorkflowPath, "utf8")) {
	return parseWorkflowLaneExecutions(await source);
}

async function currentReleaseProjection(
	source = readFile(releaseWorkflowPath, "utf8"),
	rootDir = process.cwd(),
) {
	return parseWorkflowLaneExecutions(await source, { rootDir });
}

describe("structured workflow projections", () => {
	it("ignores unrelated jobs with conditional setup-node steps", () => {
		const projection = parseWorkflowLaneExecutions(`
jobs:
  unrelated:
    steps:
      - uses: actions/setup-node@test
        if: always()
        with:
          node-version: "24"
      - run: echo unrelated
  valid:
    steps:
      - uses: actions/setup-node@test
        with:
          node-version: "24"
      - run: npm run validate:lane -- unit
`);
		expect(projection).toEqual([
			{
				lane: "unit",
				job: "valid",
				runtimes: ["node-24"],
				condition: null,
				jobCondition: null,
				stepCondition: null,
			},
		]);
	});

	it("matches exact lane, runtime, and condition executions", async () => {
		const manifest = loadValidationLanes();
		assertWorkflowProjection(
			await currentProjection(),
			manifest.workflowProjections["pull-request"],
			"pull-request workflow projection",
		);
	});

	it("detects a removed Node 26 condition", async () => {
		const source = await readFile(buildWorkflowPath, "utf8");
		const mutated = source.replace(
			"        if: matrix.node-version == '26.x'\n        run: npm run validate:lane -- mocked-mcp",
			"        run: npm run validate:lane -- mocked-mcp",
		);
		const manifest = loadValidationLanes();
		const projection = await currentProjection(Promise.resolve(mutated));
		expect(() =>
			assertWorkflowProjection(
				projection,
				manifest.workflowProjections["pull-request"],
				"mutated workflow",
			),
		).toThrow("mutated workflow drifted");
	});

	it("detects a changed Node matrix value", async () => {
		const source = await readFile(buildWorkflowPath, "utf8");
		const mutated = source.replace('- "26.x"', '- "25.x"');
		await expect(currentProjection(Promise.resolve(mutated))).rejects.toThrow(
			"unknown Node matrix value",
		);
	});

	it("detects a fixed setup-node runtime in a matrix job", async () => {
		const source = await readFile(buildWorkflowPath, "utf8");
		const mutated = source.replace(
			"node-version: ${{ matrix.node-version }}",
			'node-version: "24"',
		);
		const manifest = loadValidationLanes();
		const projection = await currentProjection(Promise.resolve(mutated));
		expect(() =>
			assertWorkflowProjection(
				projection,
				manifest.workflowProjections["pull-request"],
				"fixed matrix setup-node",
			),
		).toThrow("fixed matrix setup-node drifted");
	});

	it("rejects a conditional setup-node step", async () => {
		const source = await readFile(buildWorkflowPath, "utf8");
		const mutated = source.replace(
			"        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0\n        with:",
			"        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0\n        if: matrix.node-version == '24.x'\n        with:",
		);
		await expect(currentProjection(Promise.resolve(mutated))).rejects.toThrow(
			"must be unconditional",
		);
	});

	it("rejects setup-node moved after validation steps", async () => {
		const source = await readFile(buildWorkflowPath, "utf8");
		const setupBlock = source.match(
			/      - name: Set up Node\.js\n        uses: actions\/setup-node@[^\n]+\n        with:\n          node-version: \$\{\{ matrix\.node-version \}\}\n          cache: "npm"\n/,
		)?.[0];
		if (!setupBlock) throw new Error("setup-node fixture block is missing");
		const mutated = source
			.replace(setupBlock, "")
			.replace(
				"      - name: Verify Worker bundle",
				`${setupBlock}      - name: Verify Worker bundle`,
			);
		await expect(currentProjection(Promise.resolve(mutated))).rejects.toThrow(
			"must follow an unconditional setup-node",
		);
	});

	it("detects a changed Node 24 condition", async () => {
		const source = await readFile(buildWorkflowPath, "utf8");
		const mutated = source.replace(
			"        if: matrix.node-version == '24.x'\n        run: npm run validate:lane -- worker-bundle",
			"        if: matrix.node-version == '26.x'\n        run: npm run validate:lane -- worker-bundle",
		);
		const manifest = loadValidationLanes();
		const projection = await currentProjection(Promise.resolve(mutated));
		expect(() =>
			assertWorkflowProjection(
				projection,
				manifest.workflowProjections["pull-request"],
				"mutated condition",
			),
		).toThrow("mutated condition drifted");
	});

	it("matches the release workflow runtime observed from .nvmrc", async () => {
		const manifest = loadValidationLanes();
		assertWorkflowProjection(
			await currentReleaseProjection(),
			manifest.workflowProjections.release,
			"release workflow projection",
		);
	});

	it("detects a changed release .nvmrc runtime", async () => {
		const rootDir = await mkdtemp(join(tmpdir(), "workflow-projection-"));
		try {
			await writeFile(join(rootDir, ".nvmrc"), "26\n");
			const manifest = loadValidationLanes();
			const projection = await currentReleaseProjection(undefined, rootDir);
			expect(() =>
				assertWorkflowProjection(
					projection,
					manifest.workflowProjections.release,
					"mutated release .nvmrc",
				),
			).toThrow("mutated release .nvmrc drifted");
		} finally {
			await rm(rootDir, { recursive: true, force: true });
		}
	});

	it("detects a changed release setup-node version", async () => {
		const source = await readFile(releaseWorkflowPath, "utf8");
		const mutated = source.replaceAll(
			'node-version-file: ".nvmrc"',
			'node-version: "26"',
		);
		const manifest = loadValidationLanes();
		const projection = await currentReleaseProjection(Promise.resolve(mutated));
		expect(() =>
			assertWorkflowProjection(
				projection,
				manifest.workflowProjections.release,
				"mutated release setup-node",
			),
		).toThrow("mutated release setup-node drifted");
	});

	it("detects release job condition drift", async () => {
		const source = await readFile(releaseWorkflowPath, "utf8");
		const mutated = source.replace(
			"github.event.workflow_run.conclusion == 'success' &&",
			"always() &&",
		);
		const manifest = loadValidationLanes();
		const projection = await currentReleaseProjection(Promise.resolve(mutated));
		expect(() =>
			assertWorkflowProjection(
				projection,
				manifest.workflowProjections.release,
				"mutated release job condition",
			),
		).toThrow("mutated release job condition drifted");
	});
});
