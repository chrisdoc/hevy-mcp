import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	mappedLaneTargets,
	parseWorkflowLaneExecutions,
	validateWorkflowAggregate,
	validateWorkflowProjections,
} from "./workflow-projections.mjs";
import type { ValidationLanes } from "./workflow-projections.mjs";

const lanes: ValidationLanes = {
	lanes: [
		{
			id: "unit",
			nxTarget: "test:unit",
			mappingStatus: "mapped",
			runtimes: ["node-24", "node-26"],
		},
		{
			id: "stdio",
			nxTarget: "test:stdio",
			mappingStatus: "mapped",
			runtimes: ["node-24"],
		},
		{
			id: "external",
			nxTarget: null,
			mappingStatus: "external",
			runtimes: ["node-24"],
		},
	],
	aggregates: {
		"pull-request-ci": {
			lanes: ["unit", "stdio"],
		},
	},
};

const workflow = `
jobs:
  build:
    strategy:
      matrix:
        node-version: ["24.x", "26.x"]
    steps:
      - name: Set up Node.js
        uses: actions/setup-node@test
        with:
          node-version: \${{ matrix.node-version }}
      - name: Unit Node 24
        if: matrix.node-version == '24.x'
        run: npx nx run repository:test:unit -- --coverage
      - name: Unit Node 26
        if: matrix.node-version == '26.x'
        run: npx nx run repository:test:unit -- --coverage
      - name: Stdio
        if: matrix.node-version == '24.x'
        run: npx nx run repository:test:stdio
`;

function expectFailure(callback: () => unknown, pattern: RegExp) {
	expect(callback).toThrow(pattern);
}

function validate(source = workflow) {
	return validateWorkflowAggregate(source, {
		lanes,
		aggregateId: "pull-request-ci",
		expectedJobs: "build",
		label: "fixture workflow",
	});
}

describe("workflow projection adapter", () => {
	it("projects split matrix executions into canonical lane runtimes", () => {
		const result = validate();
		expect(result.executions).toHaveLength(3);
		expect(
			result.executions.map(({ lane, runtimes }) => ({ lane, runtimes })),
		).toEqual([
			{ lane: "unit", runtimes: ["node-24"] },
			{ lane: "unit", runtimes: ["node-26"] },
			{ lane: "stdio", runtimes: ["node-24"] },
		]);
	});

	it("retains exact Nx command and arguments for callers", () => {
		const targets = mappedLaneTargets(lanes);
		const executions = parseWorkflowLaneExecutions(workflow, {
			laneTargets: targets,
			includeCommands: true,
		});
		const unit = executions.find((entry) => entry.lane === "unit");
		expect(unit).toMatchObject({
			target: "test:unit",
			args: "-- --coverage",
			command: "npx nx run repository:test:unit -- --coverage",
			job: "build",
		});
	});

	it("fails closed on duplicate mapped command identity", () => {
		const duplicate = workflow.replace(
			"      - name: Stdio",
			"      - name: Duplicate Stdio\n        if: matrix.node-version == '24.x'\n        run: npx nx run repository:test:stdio\n      - name: Stdio",
		);
		expectFailure(
			() => validate(duplicate),
			/duplicate mapped command identity/,
		);
	});

	it("fails closed when a canonical lane is missing", () => {
		const missing = workflow.replace(
			"      - name: Stdio\n        if: matrix.node-version == '24.x'\n        run: npx nx run repository:test:stdio\n",
			"",
		);
		expectFailure(() => validate(missing), /lane membership drifted/);
	});

	it("fails closed when a mapped command target drifts", () => {
		const wrongTarget = workflow.replace(
			"repository:test:stdio",
			"repository:test:unknown",
		);
		expectFailure(() => validate(wrongTarget), /lane membership drifted/);
	});

	it("fails closed when runtime matrix values drift", () => {
		const wrongRuntime = workflow.replace(
			'["24.x", "26.x"]',
			'["24.x", "25.x"]',
		);
		expectFailure(
			() => validate(wrongRuntime),
			/Unsupported Node matrix value|unknown Node matrix value|runtimes drifted/,
		);
	});

	it("fails closed when a condition selects the wrong matrix lane", () => {
		const wrongCondition = workflow.replace(
			"if: matrix.node-version == '24.x'\n        run: npx nx run repository:test:stdio",
			"if: matrix.node-version == '26.x'\n        run: npx nx run repository:test:stdio",
		);
		expectFailure(
			() => validate(wrongCondition),
			/duplicate mapped command identity|runtimes drifted/,
		);
	});

	it("rejects non-exact matrix conditions", () => {
		const nonExact = workflow.replace(
			"if: matrix.node-version == '24.x'\n        run: npx nx run repository:test:stdio",
			"if: matrix.node-version != '26.x'\n        run: npx nx run repository:test:stdio",
		);
		expectFailure(() => validate(nonExact), /exact Node equality/);
	});

	it("requires setup-node before mapped commands", () => {
		const setup =
			"      - name: Set up Node.js\n        uses: actions/setup-node@test\n        with:\n          node-version: ${{ matrix.node-version }}\n";
		const setupAfterCommand = workflow.replace(setup, "") + setup;
		expectFailure(
			() => validate(setupAfterCommand),
			/must follow an unconditional setup-node/,
		);
	});

	it("validates canonical job identity without copying conditions into the model", () => {
		const wrongJob = workflow.replace("  build:\n", "  changed-build:\n");
		expectFailure(
			() => validate(wrongJob),
			/job identity drifted.*expected build.*found changed-build/,
		);
	});

	it("scopes aggregate validation to declared workflow jobs", () => {
		const preview = `
  publish-preview:
    steps:
      - uses: actions/setup-node@test
        with:
          node-version: "24.x"
      - run: npx nx run repository:test:stdio
`;
		const withPreview = workflow + preview;
		expect(() =>
			validateWorkflowAggregate(withPreview, {
				lanes,
				aggregateId: "pull-request-ci",
				expectedJobs: "build",
				jobIds: ["build"],
			}),
		).not.toThrow();
		expectFailure(
			() =>
				validateWorkflowAggregate(withPreview, {
					lanes,
					aggregateId: "pull-request-ci",
					expectedJobs: "build",
				}),
			/job identity drifted.*found publish-preview/,
		);
	});

	it("uses workflowRuntimes for workerd lanes hosted by Node", () => {
		const hosted = structuredClone(lanes);
		hosted.lanes[1].runtimes = ["workerd"];
		hosted.lanes[1].workflowRuntimes = ["node-24"];
		expect(() =>
			validateWorkflowAggregate(workflow, {
				lanes: hosted,
				aggregateId: "pull-request-ci",
			}),
		).not.toThrow();
	});

	it("uses aggregate workflow runtime overrides before lane defaults", () => {
		const overridden = structuredClone(lanes);
		overridden.lanes[1].workflowRuntimes = ["node-26"];
		overridden.aggregates["pull-request-ci"].workflowRuntimes = {
			stdio: ["node-24"],
		};
		expect(() =>
			validateWorkflowAggregate(workflow, {
				lanes: overridden,
				aggregateId: "pull-request-ci",
			}),
		).not.toThrow();
	});

	it("rejects aggregate workflow runtime keys outside membership", () => {
		const invalid = structuredClone(lanes);
		invalid.aggregates["pull-request-ci"].workflowRuntimes = {
			external: ["node-24"],
		};
		expectFailure(
			() =>
				validateWorkflowAggregate(workflow, {
					lanes: invalid,
					aggregateId: "pull-request-ci",
				}),
			/workflowRuntimes references a lane outside the aggregate/,
		);
	});

	it("does not allow external lanes to invent Nx targets", () => {
		const invalid = structuredClone(lanes);
		invalid.lanes[2].nxTarget = "test:external";
		expectFailure(
			() => mappedLaneTargets(invalid),
			/must not invent an Nx target/,
		);
	});

	it("rejects external lanes in an executable aggregate", () => {
		const invalid = structuredClone(lanes);
		invalid.aggregates["pull-request-ci"].lanes.push("external");
		expectFailure(
			() =>
				validateWorkflowAggregate(workflow, {
					lanes: invalid,
					aggregateId: "pull-request-ci",
				}),
			/is not mapped to Nx/,
		);
	});
});

describe("validateWorkflowProjections with string jobs parameter", () => {
	let root: string;

	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	it("validates a named job without forwarding it as jobIds", async () => {
		root = await mkdtemp(join(tmpdir(), "hevy-workflow-projections-"));
		await writeFile(join(root, "build-and-test.yml"), workflow, "utf8");
		const results = validateWorkflowProjections(lanes, {
			rootDir: root,
			workflows: {
				"pull-request-ci": {
					path: "build-and-test.yml",
					jobs: "build",
				},
			},
		});
		expect(results["pull-request-ci"].executions).toHaveLength(3);
		expect(results["pull-request-ci"].aggregate.lanes).toEqual([
			"unit",
			"stdio",
		]);
	});
});
