import { describe, expect, it } from "vitest";
import {
	aggregateLaneRuns,
	findMissingVitestCases,
	parseVitestList,
	selectVitestCases,
	summarizeLaneOverlaps,
} from "./validation-lane-inventory.mjs";

describe("validation lane inventory helpers", () => {
	it("parses repository-relative test files and preserves nested full names", () => {
		expect(
			parseVitestList(
				JSON.stringify([
					{
						file: "/repo/tests/a.test.ts",
						name: "outer suite > nested suite > works",
					},
				]),
				"/repo",
			),
		).toEqual([
			{
				file: "tests/a.test.ts",
				fullName: "outer suite > nested suite > works",
			},
		]);
	});

	it("parses the plain-text listing emitted by the Workerd Vitest config", () => {
		expect(
			parseVitestList(
				"tests/cloudflare/worker.test.ts > Worker > returns a response\n",
				"/repo",
				{ json: false },
			),
		).toEqual([
			{
				file: "tests/cloudflare/worker.test.ts",
				fullName: "Worker > returns a response",
			},
		]);
	});

	it("rejects malformed JSON listings instead of fabricating test identities", () => {
		expect(() =>
			parseVitestList(
				'[{"file":"/repo/tests/a.test.ts","name":"suite > real"},\ntests/fake.test.ts > fabricated\n',
				"/repo",
			),
		).toThrow(SyntaxError);
	});

	it("uses explicit lane runtime environment metadata, not aggregate membership", () => {
		const aggregates = {
			"pull-request-ci": {
				lanes: ["unit", "performance"],
				workflowRuntimes: { unit: ["node-24", "node-26"] },
				workflowEnvironment: {
					unit: {
						"node-24": { HEVY_TEST_REPORT_MODE: "ci" },
						"node-26": { HEVY_TEST_REPORT_MODE: "ci" },
					},
				},
			},
		};

		expect(aggregateLaneRuns(aggregates, "unit")).toEqual([
			{
				aggregate: "pull-request-ci",
				workflowRuntimes: ["node-24", "node-26"],
				workflowEnvironment: {
					"node-24": { HEVY_TEST_REPORT_MODE: "ci" },
					"node-26": { HEVY_TEST_REPORT_MODE: "ci" },
				},
			},
		]);
		expect(aggregateLaneRuns(aggregates, "performance")).toEqual([
			{
				aggregate: "pull-request-ci",
				workflowRuntimes: undefined,
				workflowEnvironment: {},
			},
		]);
	});

	it("compares exact test identities and counts pairwise lane repetition", () => {
		const inventory = summarizeLaneOverlaps([
			{
				id: "unit",
				discovery: {
					status: "enumerated",
					cases: [
						{ file: "tests/a.test.ts", fullName: "suite > one" },
						{ file: "tests/a.test.ts", fullName: "suite > one" },
						{ file: "tests/a.test.ts", fullName: "suite > two" },
					],
				},
			},
			{
				id: "contract",
				discovery: {
					status: "enumerated",
					cases: [{ file: "tests/a.test.ts", fullName: "suite > one" }],
				},
			},
			{
				id: "node-test",
				discovery: { status: "file-only", files: ["tests/a.test.ts"] },
			},
		]);

		expect(inventory).toEqual({
			cases: [
				{
					identity: "tests/a.test.ts > suite > one",
					lanes: ["contract", "unit"],
					occurrences: { contract: 1, unit: 2 },
				},
			],
			pairs: [{ lanes: ["contract", "unit"], cases: 1 }],
		});
	});

	it("applies exact file and recursive directory selectors", () => {
		const cases = [
			{ file: "tests/integration/mocked/a.test.ts", fullName: "works" },
			{ file: "tests/integration/worker-http.test.ts", fullName: "responds" },
			{ file: "tests/unit/a.test.ts", fullName: "works" },
		];
		expect(
			selectVitestCases(
				{
					include: ["tests/integration/**"],
					exclude: ["tests/integration/worker-http.test.ts"],
				},
				cases,
			),
		).toEqual([cases[0]]);
	});

	it("retains missing duplicate-name occurrences when comparing environments", () => {
		const cases = [{ file: "tests/unit/a.test.ts", fullName: "suite > case" }];
		expect(findMissingVitestCases([...cases, ...cases], cases)).toEqual(cases);
	});
});
