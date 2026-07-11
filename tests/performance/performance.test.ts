import { performance } from "node:perf_hooks";
import { expect, it } from "vitest";
import {
	callPerformanceTool,
	createPerformanceHarness,
	measuredDuration,
	observeServerRss,
	type PerformanceHarness,
} from "./harness.js";
import {
	createPerformanceReport,
	performanceReportSchema,
	type PerformanceScenario,
	writePerformanceReport,
} from "./report.js";
import {
	createScenarioState,
	finalizeScenario,
	recordFailure,
	recordFixtureResult,
	type ScenarioState,
} from "./scenario.js";

const STARTUP_ITERATIONS = 10;
const TOOLS_LIST_ITERATIONS = 20;
const MOCKED_READ_ITERATIONS = 20;
const CONCURRENT_CALLS = 20;
const SEQUENTIAL_CALLS = 100;

async function closeHarness(
	state: ScenarioState,
	harness: PerformanceHarness,
	iteration: number,
) {
	state.serverMemory.push(
		observeServerRss(harness.pid, iteration, "scenario-complete"),
	);
	try {
		recordFixtureResult(state, iteration, await harness.close());
	} catch (error) {
		recordFailure(state, iteration, "cleanup", error);
	}
}

async function runStartupScenario() {
	const state = createScenarioState(
		"startup-initialization",
		STARTUP_ITERATIONS,
		{
			description: "Startup plus MCP initialize p95 below 2 seconds",
			p95Milliseconds: 2_000,
			informationalOnly: true,
		},
	);
	const scenarioStartedAt = performance.now();

	for (let iteration = 1; iteration <= STARTUP_ITERATIONS; iteration += 1) {
		const startedAt = performance.now();
		let harness: PerformanceHarness | undefined;
		try {
			harness = await createPerformanceHarness("startup");
			state.durations.push(measuredDuration(startedAt));
			state.completedIterations += 1;
			state.serverMemory.push(
				observeServerRss(harness.pid, iteration, "initialized"),
			);
		} catch (error) {
			state.durations.push(measuredDuration(startedAt));
			recordFailure(state, iteration, "setup", error);
		}
		if (harness) await closeHarness(state, harness, iteration);
	}

	return finalizeScenario(state, measuredDuration(scenarioStartedAt));
}

async function runSingleProcessScenario(
	state: ScenarioState,
	mode:
		| "tools-list"
		| "representative-read"
		| "concurrent-reads"
		| "sequential-reads",
	operation: (harness: PerformanceHarness) => Promise<void>,
) {
	const scenarioStartedAt = performance.now();
	let harness: PerformanceHarness | undefined;
	try {
		harness = await createPerformanceHarness(mode);
		state.serverMemory.push(observeServerRss(harness.pid, 1, "initialized"));
		await operation(harness);
	} catch (error) {
		if (state.durations.length === 0) {
			state.durations.push(measuredDuration(scenarioStartedAt));
		}
		recordFailure(state, 1, "setup", error);
	} finally {
		if (harness) {
			await closeHarness(
				state,
				harness,
				Math.max(state.completedIterations, 1),
			);
		}
	}
	return finalizeScenario(state, measuredDuration(scenarioStartedAt));
}

async function runToolsListScenario() {
	const state = createScenarioState("mcp-tools-list", TOOLS_LIST_ITERATIONS, {
		description: "MCP tools/list p95 below 100 milliseconds",
		p95Milliseconds: 100,
		informationalOnly: true,
	});
	return runSingleProcessScenario(state, "tools-list", async (harness) => {
		for (
			let iteration = 1;
			iteration <= TOOLS_LIST_ITERATIONS;
			iteration += 1
		) {
			const startedAt = performance.now();
			try {
				const result = await harness.client.listTools();
				expect(result.tools.length).toBeGreaterThan(0);
				expect(result.tools.map(({ name }) => name)).toContain(
					"get-workout-count",
				);
				state.completedIterations += 1;
			} catch (error) {
				recordFailure(state, iteration, "iteration", error);
			} finally {
				state.durations.push(measuredDuration(startedAt));
			}
		}
	});
}

async function runRepresentativeReadScenario() {
	const state = createScenarioState(
		"representative-mocked-read",
		MOCKED_READ_ITERATIONS,
		{
			description: "Representative mocked read p95 below 500 milliseconds",
			p95Milliseconds: 500,
			informationalOnly: true,
		},
	);
	return runSingleProcessScenario(
		state,
		"representative-read",
		async (harness) => {
			for (
				let iteration = 1;
				iteration <= MOCKED_READ_ITERATIONS;
				iteration += 1
			) {
				const startedAt = performance.now();
				try {
					const result = await callPerformanceTool(
						harness.client,
						"get-workout-count",
						{},
					);
					expect(result.structuredContent).toEqual({ count: iteration });
					state.completedIterations += 1;
				} catch (error) {
					recordFailure(state, iteration, "iteration", error);
				} finally {
					state.durations.push(measuredDuration(startedAt));
				}
			}
		},
	);
}

async function runConcurrentScenario() {
	const state = createScenarioState(
		"concurrent-20-call-burst",
		CONCURRENT_CALLS,
		{
			description: "20 concurrent calls preserve response correlation",
			p95Milliseconds: null,
			informationalOnly: true,
		},
	);
	return runSingleProcessScenario(
		state,
		"concurrent-reads",
		async (harness) => {
			const results = await Promise.allSettled(
				Array.from({ length: CONCURRENT_CALLS }, async (_, index) => {
					const iteration = index + 1;
					const id = `concurrent-${iteration}`;
					const startedAt = performance.now();
					try {
						const result = await callPerformanceTool(
							harness.client,
							"get-workout",
							{ workoutId: id },
						);
						expect(result.structuredContent).toMatchObject({ workout: { id } });
						state.completedIterations += 1;
					} finally {
						state.durations[index] = measuredDuration(startedAt);
					}
				}),
			);
			for (const [index, result] of results.entries()) {
				if (result.status === "rejected") {
					recordFailure(state, index + 1, "iteration", result.reason);
				}
			}
		},
	);
}

async function runSequentialScenario() {
	const state = createScenarioState(
		"sequential-100-mocked-reads",
		SEQUENTIAL_CALLS,
		{
			description: "100 sequential mocked reads remain ordered and correct",
			p95Milliseconds: null,
			informationalOnly: true,
		},
	);
	return runSingleProcessScenario(
		state,
		"sequential-reads",
		async (harness) => {
			for (let iteration = 1; iteration <= SEQUENTIAL_CALLS; iteration += 1) {
				const startedAt = performance.now();
				try {
					const result = await callPerformanceTool(
						harness.client,
						"get-workout-count",
						{},
					);
					expect(result.structuredContent).toEqual({ count: iteration });
					state.completedIterations += 1;
				} catch (error) {
					recordFailure(state, iteration, "iteration", error);
				} finally {
					state.durations.push(measuredDuration(startedAt));
				}
			}
		},
	);
}

async function runFailureSafe(
	runner: () => Promise<PerformanceScenario>,
	fallback: ScenarioState,
) {
	const startedAt = performance.now();
	try {
		return await runner();
	} catch (error) {
		recordFailure(fallback, 1, "setup", error);
		return finalizeScenario(fallback, measuredDuration(startedAt));
	}
}

it("records the spawned built-CLI performance baseline", async () => {
	const scenarios: PerformanceScenario[] = [];
	scenarios.push(
		await runFailureSafe(
			runStartupScenario,
			createScenarioState("startup-initialization", STARTUP_ITERATIONS, {
				description: "Startup plus MCP initialize p95 below 2 seconds",
				p95Milliseconds: 2_000,
				informationalOnly: true,
			}),
		),
	);
	scenarios.push(
		await runFailureSafe(
			runToolsListScenario,
			createScenarioState("mcp-tools-list", TOOLS_LIST_ITERATIONS, {
				description: "MCP tools/list p95 below 100 milliseconds",
				p95Milliseconds: 100,
				informationalOnly: true,
			}),
		),
	);
	scenarios.push(
		await runFailureSafe(
			runRepresentativeReadScenario,
			createScenarioState(
				"representative-mocked-read",
				MOCKED_READ_ITERATIONS,
				{
					description: "Representative mocked read p95 below 500 milliseconds",
					p95Milliseconds: 500,
					informationalOnly: true,
				},
			),
		),
	);
	scenarios.push(
		await runFailureSafe(
			runConcurrentScenario,
			createScenarioState("concurrent-20-call-burst", CONCURRENT_CALLS, {
				description: "20 concurrent calls preserve response correlation",
				p95Milliseconds: null,
				informationalOnly: true,
			}),
		),
	);
	scenarios.push(
		await runFailureSafe(
			runSequentialScenario,
			createScenarioState("sequential-100-mocked-reads", SEQUENTIAL_CALLS, {
				description: "100 sequential mocked reads remain ordered and correct",
				p95Milliseconds: null,
				informationalOnly: true,
			}),
		),
	);

	let report: ReturnType<typeof createPerformanceReport>;
	try {
		report = createPerformanceReport(scenarios);
		performanceReportSchema.parse(report);
	} finally {
		// Scenario runners never omit entries; writing occurs before correctness gates.
		writePerformanceReport(createPerformanceReport(scenarios));
	}

	expect(scenarios.map(({ name }) => name)).toEqual([
		"startup-initialization",
		"mcp-tools-list",
		"representative-mocked-read",
		"concurrent-20-call-burst",
		"sequential-100-mocked-reads",
	]);
	expect(report.correctness.failures).toEqual([]);
}, 60_000);
