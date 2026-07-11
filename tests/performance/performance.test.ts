import { performance } from "node:perf_hooks";
import nock from "nock";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
	assertPerformanceMocksComplete,
	callPerformanceTool,
	createPerformanceHarness,
	getPerformanceApiScope,
} from "./harness.js";
import {
	createPerformanceReport,
	observeMemory,
	performanceReportSchema,
	summarizeDurations,
	type PerformanceScenario,
	writePerformanceReport,
} from "./report.js";

const STARTUP_ITERATIONS = 10;
const TOOLS_LIST_ITERATIONS = 20;
const MOCKED_READ_ITERATIONS = 20;
const CONCURRENT_CALLS = 20;
const SEQUENTIAL_CALLS = 100;

type ScenarioName = PerformanceScenario["name"];

class PerformanceScenarioFailure extends Error {
	constructor(public readonly scenario: PerformanceScenario) {
		super(
			`${scenario.name} failed: ${scenario.correctness.failures[0]?.message}`,
		);
	}
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function createScenario(
	name: ScenarioName,
	iterations: number,
	durations: number[],
	memoryBefore: NodeJS.MemoryUsage,
	memoryAfter: NodeJS.MemoryUsage,
	target: PerformanceScenario["target"],
	failures: PerformanceScenario["correctness"]["failures"] = [],
): PerformanceScenario {
	return {
		name,
		iterations,
		durationsMs: summarizeDurations(durations.length > 0 ? durations : [0]),
		correctness: {
			failureCount: failures.length,
			failures,
		},
		memory: observeMemory(memoryBefore, memoryAfter),
		target,
	};
}

async function measureIterations(
	name: ScenarioName,
	iterations: number,
	target: PerformanceScenario["target"],
	operation: (iteration: number) => Promise<void>,
) {
	const durations: number[] = [];
	const memoryBefore = process.memoryUsage();

	for (let iteration = 1; iteration <= iterations; iteration += 1) {
		const startedAt = performance.now();
		try {
			await operation(iteration);
			durations.push(performance.now() - startedAt);
		} catch (error) {
			durations.push(performance.now() - startedAt);
			const scenario = createScenario(
				name,
				iterations,
				durations,
				memoryBefore,
				process.memoryUsage(),
				target,
				[{ iteration, message: errorMessage(error) }],
			);
			throw new PerformanceScenarioFailure(scenario);
		}
	}

	return createScenario(
		name,
		iterations,
		durations,
		memoryBefore,
		process.memoryUsage(),
		target,
	);
}

async function measureConcurrentBurst(
	operation: (iteration: number) => Promise<void>,
) {
	const memoryBefore = process.memoryUsage();
	const durations = Array.from({ length: CONCURRENT_CALLS }, () => 0);
	const startedAt = Array.from({ length: CONCURRENT_CALLS }, () =>
		performance.now(),
	);
	const results = await Promise.allSettled(
		Array.from({ length: CONCURRENT_CALLS }, async (_, index) => {
			try {
				await operation(index + 1);
			} finally {
				durations[index] = performance.now() - (startedAt[index] ?? 0);
			}
		}),
	);
	const failures: PerformanceScenario["correctness"]["failures"] =
		results.flatMap((result, index) =>
			result.status === "rejected"
				? [{ iteration: index + 1, message: errorMessage(result.reason) }]
				: [],
		);
	try {
		assertPerformanceMocksComplete();
	} catch (error) {
		failures.push({
			iteration: CONCURRENT_CALLS,
			message: errorMessage(error),
		});
	}

	const scenario = createScenario(
		"concurrent-20-call-burst",
		CONCURRENT_CALLS,
		durations,
		memoryBefore,
		process.memoryUsage(),
		{
			description: "20 concurrent calls preserve response correlation",
			p95Milliseconds: null,
			informationalOnly: true,
		},
		failures,
	);

	if (failures.length > 0) {
		throw new PerformanceScenarioFailure(scenario);
	}

	return scenario;
}

function workoutFixture(id: string) {
	return {
		id,
		title: `Performance Workout ${id}`,
		description: "Deterministic local fixture",
		start_time: "2026-01-01T08:00:00Z",
		end_time: "2026-01-01T09:00:00Z",
		created_at: "2026-01-01T08:00:00Z",
		updated_at: "2026-01-01T09:00:00Z",
		exercises: [],
	};
}

beforeAll(() => {
	nock.disableNetConnect();
});

afterAll(() => {
	nock.cleanAll();
	nock.enableNetConnect();
});

it("records the deterministic local performance baseline", async () => {
	const scenarios: PerformanceScenario[] = [];

	try {
		scenarios.push(
			await measureIterations(
				"startup-initialization",
				STARTUP_ITERATIONS,
				{
					description: "Startup plus MCP initialize p95 below 2 seconds",
					p95Milliseconds: 2_000,
					informationalOnly: true,
				},
				async () => {
					const harness = await createPerformanceHarness();
					await harness.close();
				},
			),
		);

		const listHarness = await createPerformanceHarness();
		try {
			scenarios.push(
				await measureIterations(
					"mcp-tools-list",
					TOOLS_LIST_ITERATIONS,
					{
						description: "MCP tools/list p95 below 100 milliseconds",
						p95Milliseconds: 100,
						informationalOnly: true,
					},
					async () => {
						const result = await listHarness.client.listTools();
						expect(result.tools.length).toBeGreaterThan(0);
						expect(result.tools.map(({ name }) => name)).toContain(
							"get-workout-count",
						);
					},
				),
			);
		} finally {
			await listHarness.close();
		}

		const readHarness = await createPerformanceHarness();
		try {
			scenarios.push(
				await measureIterations(
					"representative-mocked-read",
					MOCKED_READ_ITERATIONS,
					{
						description:
							"Representative mocked read p95 below 500 milliseconds",
						p95Milliseconds: 500,
						informationalOnly: true,
					},
					async (iteration) => {
						getPerformanceApiScope()
							.get("/v1/workouts/count")
							.reply(200, { workout_count: iteration });
						const result = await callPerformanceTool(
							readHarness.client,
							"get-workout-count",
							{},
						);
						expect(result.structuredContent).toEqual({ count: iteration });
						assertPerformanceMocksComplete();
					},
				),
			);
		} finally {
			await readHarness.close();
		}

		const concurrentHarness = await createPerformanceHarness();
		try {
			for (let index = 1; index <= CONCURRENT_CALLS; index += 1) {
				const id = `concurrent-${index}`;
				getPerformanceApiScope()
					.get(`/v1/workouts/${id}`)
					.reply(200, workoutFixture(id));
			}

			scenarios.push(
				await measureConcurrentBurst(async (iteration) => {
					const id = `concurrent-${iteration}`;
					const result = await callPerformanceTool(
						concurrentHarness.client,
						"get-workout",
						{ workoutId: id },
					);
					expect(result.structuredContent).toMatchObject({
						workout: { id },
					});
				}),
			);
		} finally {
			await concurrentHarness.close();
		}

		const sequentialHarness = await createPerformanceHarness();
		try {
			scenarios.push(
				await measureIterations(
					"sequential-100-mocked-reads",
					SEQUENTIAL_CALLS,
					{
						description:
							"100 sequential mocked reads remain correct and leak-free",
						p95Milliseconds: null,
						informationalOnly: true,
					},
					async (iteration) => {
						getPerformanceApiScope()
							.get("/v1/workouts/count")
							.reply(200, { workout_count: iteration });
						const result = await callPerformanceTool(
							sequentialHarness.client,
							"get-workout-count",
							{},
						);
						expect(result.structuredContent).toEqual({ count: iteration });
						assertPerformanceMocksComplete();
					},
				),
			);
		} finally {
			await sequentialHarness.close();
		}
	} catch (error) {
		if (error instanceof PerformanceScenarioFailure) {
			scenarios.push(error.scenario);
		}
		throw error;
	} finally {
		const report = createPerformanceReport(scenarios);
		performanceReportSchema.parse(report);
		writePerformanceReport(report);
	}

	expect(scenarios.map(({ name }) => name)).toEqual([
		"startup-initialization",
		"mcp-tools-list",
		"representative-mocked-read",
		"concurrent-20-call-burst",
		"sequential-100-mocked-reads",
	]);
	expect(
		scenarios.every(({ correctness }) => correctness.failureCount === 0),
	).toBe(true);
}, 30_000);
