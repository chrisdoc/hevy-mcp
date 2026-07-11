import type { FixtureResult } from "./fixture-result.js";
import type { ServerMemoryObservation } from "./harness.js";
import {
	observeRunnerMemory,
	summarizeDurations,
	type PerformanceFailure,
	type PerformanceScenario,
} from "./report.js";

export interface ScenarioState {
	name: PerformanceScenario["name"];
	configuredIterations: number;
	completedIterations: number;
	durations: number[];
	failures: PerformanceFailure[];
	fixtureResults: FixtureResult[];
	serverMemory: ServerMemoryObservation[];
	runnerMemoryBefore: NodeJS.MemoryUsage;
	target: PerformanceScenario["target"];
}

export function createScenarioState(
	name: ScenarioState["name"],
	configuredIterations: number,
	target: ScenarioState["target"],
): ScenarioState {
	return {
		name,
		configuredIterations,
		completedIterations: 0,
		durations: [],
		failures: [],
		fixtureResults: [],
		serverMemory: [],
		runnerMemoryBefore: process.memoryUsage(),
		target,
	};
}

export function recordFailure(
	state: ScenarioState,
	iteration: number,
	phase: PerformanceFailure["phase"],
	error: unknown,
) {
	state.failures.push({
		iteration,
		phase,
		message: error instanceof Error ? error.message : String(error),
	});
}

export function recordFixtureResult(
	state: ScenarioState,
	iteration: number,
	result: FixtureResult,
) {
	state.fixtureResults.push(result);
	if (!result.verified) {
		recordFailure(
			state,
			iteration,
			"verification",
			`child fixture verification failed: ${JSON.stringify(result)}`,
		);
	}
}

export function finalizeScenario(
	state: ScenarioState,
	fallbackAttemptDuration: number,
): PerformanceScenario {
	const durations =
		state.durations.length > 0
			? state.durations
			: [Math.max(fallbackAttemptDuration, Number.EPSILON)];
	return {
		name: state.name,
		configuredIterations: state.configuredIterations,
		completedIterations: state.completedIterations,
		durationsMs: summarizeDurations(durations),
		correctness: {
			failureCount: state.failures.length,
			failures: state.failures,
		},
		fixtureVerification: {
			processCount: state.fixtureResults.length,
			verifiedProcessCount: state.fixtureResults.filter(
				(result) => result.verified,
			).length,
			results: state.fixtureResults,
		},
		memory: {
			serverProcess: {
				source: "/proc/<pid>/status VmRSS with nullable fallback",
				observations: state.serverMemory,
			},
			parentRunner: observeRunnerMemory(
				state.runnerMemoryBefore,
				process.memoryUsage(),
			),
		},
		target: state.target,
	};
}
