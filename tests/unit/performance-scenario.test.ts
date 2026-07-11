import { describe, expect, it } from "vitest";
import {
	createScenarioState,
	finalizeScenario,
	recordFailure,
} from "../performance/scenario.js";

describe("failure-safe performance scenarios", () => {
	it("records a real failed setup attempt instead of a zero duration", () => {
		const state = createScenarioState("mcp-tools-list", 20, {
			description: "informational",
			p95Milliseconds: 100,
			informationalOnly: true,
		});
		recordFailure(state, 1, "setup", new Error("spawn failed"));

		const scenario = finalizeScenario(state, 12.5);
		expect(scenario).toMatchObject({
			configuredIterations: 20,
			completedIterations: 0,
			durationsMs: { p50: 12.5, p95: 12.5, max: 12.5 },
			correctness: { failureCount: 1 },
		});
	});
});
