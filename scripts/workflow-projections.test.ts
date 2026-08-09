import { describe, expect, it } from "vitest";
import { validateWorkflowAggregate } from "./workflow-projections.mjs";

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

function workflow(step: string): string {
	return `jobs:\n  release:\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: "24.x"\n      - name: Validate lane\n${step}`;
}

describe("release workflow projections", () => {
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

	it("rejects a release lane that can be ignored", () => {
		expect(() =>
			validateWorkflowAggregate(
				workflow(
					"        continue-on-error: true\n        run: npx nx run repository:test:worker-http:live\n",
				),
				{
					lanes,
					aggregate: "release",
					expectedJobs: "release",
					rejectContinueOnError: true,
				},
			),
		).toThrow("must not use continue-on-error");
	});
});
