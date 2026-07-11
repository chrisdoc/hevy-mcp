import { describe, expect, it } from "vitest";
import {
	createScenarioState,
	finalizeScenario,
	recordFailure,
	recordFixtureResult,
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

	it("preserves the operation phase separately from setup failures", () => {
		const state = createScenarioState("mcp-tools-list", 20, {
			description: "informational",
			p95Milliseconds: 100,
			informationalOnly: true,
		});
		recordFailure(state, 1, "operation", new Error("operation failed"));

		const scenario = finalizeScenario(state, 12.5);
		expect(scenario.correctness.failures).toEqual([
			{
				iteration: 1,
				phase: "operation",
				message: "operation failed",
			},
		]);
	});

	it("records failed fixture verification in the scenario result", () => {
		const state = createScenarioState("mcp-tools-list", 1, {
			description: "informational",
			p95Milliseconds: null,
			informationalOnly: true,
		});
		recordFixtureResult(state, 1, {
			version: 1,
			mode: "tools-list",
			expectedRequestCount: 1,
			observedRequestCount: 0,
			startupRequestCount: 0,
			scenarioRequestCount: 0,
			pendingMocks: ["GET /v1/user/info"],
			unexpectedRequests: [],
			blockedFetchRequests: [],
			setupFailure: null,
			cleanupFailure: null,
			verified: false,
		});

		const scenario = finalizeScenario(state, 1);
		expect(scenario.fixtureVerification).toMatchObject({
			processCount: 1,
			verifiedProcessCount: 0,
		});
		expect(scenario.correctness.failures).toHaveLength(1);
	});
});
