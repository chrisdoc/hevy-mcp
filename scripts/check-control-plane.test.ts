import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	validateHistoricalEvidence,
	validateHistoricalExecutionTotals,
} from "./check-control-plane.mjs";

const baseline = JSON.parse(
	readFileSync("repository/control-plane-baseline.json", "utf8"),
);

describe("historical control-plane evidence", () => {
	it("counts immutable source executions independently of evidence entries", () => {
		const mutated = structuredClone(baseline);
		mutated.before.validationExecutionLines.testPr.pop();

		expect(() => validateHistoricalEvidence(mutated)).toThrow(
			"testPr execution count drifted from its immutable source",
		);
	});

	it("rejects duplicate declarations for the same immutable source command", () => {
		const mutated = structuredClone(baseline);
		mutated.before.validationExecutionLines.pullRequestWorkflow[12].source.line =
			mutated.before.validationExecutionLines.pullRequestWorkflow[11].source.line;

		expect(() => validateHistoricalEvidence(mutated)).toThrow(
			"declares npm run test:mcp more than once",
		);
	});

	it("compares derived totals with recorded baseline totals", () => {
		const actual = validateHistoricalEvidence(baseline);
		const expected = structuredClone(
			baseline.before.validationExecutionLines.counts,
		);
		expected.testPrMembers += 1;

		expect(() => validateHistoricalExecutionTotals(actual, expected)).toThrow(
			"testPrMembers drifted from the recorded baseline",
		);
	});
});
