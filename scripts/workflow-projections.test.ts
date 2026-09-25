import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateWorkflowAggregate } from "./workflow-projections.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const pullRequestWorkflows = [
	".github/workflows/build-and-test.yml",
	".github/workflows/workflow-lint.yml",
	".github/workflows/codeql.yml",
	".github/workflows/token-cost.yml",
];

const lanes = {
	lanes: [
		{
			id: "worker-http-live",
			nxTarget: "test:worker-http:live",
			mappingStatus: "mapped" as const,
			runtimes: ["workerd"],
			workflowRuntimes: ["node-24"],
		},
	],
	aggregates: {
		release: { lanes: ["worker-http-live"] },
	},
};

const changesetLanes = {
	lanes: [
		{
			id: "package-changesets",
			nxTarget: "check:package-changesets",
			mappingStatus: "mapped" as const,
			runtimes: ["node-24"],
			workflowRuntimes: ["node-24"],
		},
	],
	aggregates: {
		release: { lanes: ["package-changesets"] },
	},
};

const reportModeLanes = {
	lanes: [
		{
			id: "unit",
			nxTarget: "test:unit",
			mappingStatus: "mapped" as const,
			runtimes: ["node-24"],
		},
	],
	aggregates: {
		"pull-request-ci": {
			lanes: ["unit"],
			workflowEnvironment: {
				unit: { "node-24": { HEVY_TEST_REPORT_MODE: "ci" } },
			},
		},
	},
};

function workflow(step: string, jobOptions = ""): string {
	return `jobs:\n  release:\n${jobOptions}    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: "24.x"\n      - name: Validate lane\n${step}`;
}

function pullRequestConfiguration(source: string): string | undefined {
	const lines = source.split(/\r?\n/);
	const eventIndex = lines.indexOf("  pull_request:");
	if (eventIndex < 0) return undefined;

	const configuration: string[] = [];
	for (const line of lines.slice(eventIndex + 1)) {
		if (line.length > 0 && !line.startsWith("    ")) break;
		configuration.push(line);
	}
	return configuration.join("\n");
}

describe("stacked pull request workflow triggers", () => {
	it.each(pullRequestWorkflows)(
		"runs %s for pull requests targeting stack parent branches",
		(path) => {
			const source = readFileSync(resolve(repositoryRoot, path), "utf8");
			const configuration = pullRequestConfiguration(source);

			expect(configuration).toBeDefined();
			if (configuration) expect(configuration).not.toMatch(/^\s+branches:/m);
		},
	);

	it("accepts an unfiltered pull_request event with no event options", () => {
		expect(pullRequestConfiguration("on:\n  pull_request:\n")).toBe("");
	});

	it("uses the PR event's target branch for base-sensitive checks", () => {
		const source = readFileSync(
			resolve(repositoryRoot, ".github/workflows/build-and-test.yml"),
			"utf8",
		);

		expect(source).toContain(
			"BASE_REF: ${{ github.event.pull_request.base.ref }}",
		);
		expect(source).toContain(
			"CHANGESET_BASE_REF: origin/${{ github.event.pull_request.base.ref }}",
		);
	});
});

describe("release workflow projections", () => {
	it("resolves package-script aliases to their Nx validation lanes", () => {
		const result = validateWorkflowAggregate(
			workflow("        run: pnpm run check:changeset\n"),
			{
				lanes: changesetLanes,
				aggregate: "release",
				expectedJobs: "release",
			},
		);

		expect(result.executions).toEqual([
			expect.objectContaining({
				lane: "package-changesets",
				target: "check:package-changesets",
			}),
		]);
	});

	it("maps a release lane to its declared runtime and job", () => {
		const result = validateWorkflowAggregate(
			workflow("        run: npx nx run repository:test:worker-http:live\n"),
			{
				lanes,
				aggregate: "release",
				expectedJobs: "release",
				rejectContinueOnError: true,
			},
		);

		expect(result.executions).toEqual([
			expect.objectContaining({
				lane: "worker-http-live",
				job: "release",
				runtimes: ["node-24"],
			}),
		]);
	});

	it.each([
		["step", "", "        continue-on-error: true\n"],
		["job", "    continue-on-error: true\n", ""],
	])(
		"rejects a release lane that can be ignored at the %s level",
		(_level, jobOptions, stepOptions) => {
			expect(() =>
				validateWorkflowAggregate(
					workflow(
						`${stepOptions}        run: npx nx run repository:test:worker-http:live\n`,
						jobOptions,
					),
					{
						lanes,
						aggregate: "release",
						expectedJobs: "release",
						rejectContinueOnError: true,
					},
				),
			).toThrow("must not use continue-on-error");
		},
	);
});

describe("workflow environment projections", () => {
	it("checks lane-runtime overrides against the invoking workflow step", () => {
		const source = workflow(
			"        env:\n          HEVY_TEST_REPORT_MODE: ci\n        run: npx nx run repository:test:unit\n",
		);
		const projection = validateWorkflowAggregate(source, {
			lanes: reportModeLanes,
			aggregate: "pull-request-ci",
			expectedJobs: "release",
		});

		expect(projection.executions[0]?.environment).toEqual({
			HEVY_TEST_REPORT_MODE: "ci",
		});
		expect(() =>
			validateWorkflowAggregate(
				workflow("        run: npx nx run repository:test:unit\n"),
				{
					lanes: reportModeLanes,
					aggregate: "pull-request-ci",
					expectedJobs: "release",
				},
			),
		).toThrow("environment drift for unit/node-24");
	});
});
