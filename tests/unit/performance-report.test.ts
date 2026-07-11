import { readFileSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FixtureResult } from "../performance/fixture-result.js";
import {
	createPerformanceReport,
	performanceReportSchema,
	percentile,
	PERFORMANCE_SUMMARY_PATH,
	summarizeDurations,
	type PerformanceScenario,
	writePerformanceReport,
} from "../performance/report.js";

function fixtureResult(): FixtureResult {
	return {
		version: 1,
		mode: "startup",
		expectedRequestCount: 1,
		observedRequestCount: 1,
		startupRequestCount: 1,
		scenarioRequestCount: 0,
		pendingMocks: [],
		unexpectedRequests: [],
		blockedFetchRequests: [],
		setupFailure: null,
		cleanupFailure: null,
		verified: true,
	};
}

function scenario(): PerformanceScenario {
	return {
		name: "startup-initialization",
		configuredIterations: 5,
		completedIterations: 5,
		durationsMs: { p50: 3, p95: 5, max: 5 },
		correctness: { failureCount: 0, failures: [] },
		fixtureVerification: {
			processCount: 1,
			verifiedProcessCount: 1,
			results: [fixtureResult()],
		},
		memory: {
			serverProcess: {
				source: "/proc/<pid>/status VmRSS with nullable fallback",
				observations: [
					{
						iteration: 1,
						phase: "initialized",
						rssBytes: 1024,
						unavailableReason: null,
					},
				],
			},
			parentRunner: {
				heapUsedBeforeBytes: 100,
				heapUsedAfterBytes: 120,
				heapUsedDeltaBytes: 20,
				rssBeforeBytes: 200,
				rssAfterBytes: 240,
				rssDeltaBytes: 40,
			},
		},
		target: {
			description: "Informational startup target",
			p95Milliseconds: 2_000,
			informationalOnly: true,
		},
	};
}

const scenarioNames: PerformanceScenario["name"][] = [
	"startup-initialization",
	"mcp-tools-list",
	"representative-mocked-read",
	"concurrent-20-call-burst",
	"sequential-100-mocked-reads",
];

describe("performance report statistics", () => {
	it("uses nearest-rank percentiles without mutating the sample", () => {
		const values = [5, 1, 4, 2, 3];
		expect(percentile(values, 0.5)).toBe(3);
		expect(percentile(values, 0.95)).toBe(5);
		expect(values).toEqual([5, 1, 4, 2, 3]);
	});

	it("summarizes p50, p95, and maximum durations", () => {
		const values = Array.from({ length: 20 }, (_, index) => index + 1);
		expect(summarizeDurations(values)).toEqual({ p50: 10, p95: 19, max: 20 });
	});

	it("rejects invalid percentile inputs", () => {
		expect(() => percentile([], 0.5)).toThrow("empty sample");
		expect(() => percentile([1], 0)).toThrow("greater than 0");
	});
});

describe("performance report schema", () => {
	it("accepts five versioned scenarios with reproducibility metadata", () => {
		const report = createPerformanceReport(
			scenarioNames.map((name) => ({ ...scenario(), name })),
		);
		expect(() => performanceReportSchema.parse(report)).not.toThrow();
		expect(report).toMatchObject({
			version: "2.0.0",
			environment: {
				builtCli: "dist/cli.mjs",
				transport: "spawned stdio",
			},
			configuration: {
				fixtureMode: "child-local-nock-preload",
				networkPolicy: "child-http-and-fetch-disabled",
				buildExcludedFromSamples: true,
			},
			correctness: { failureCount: 0 },
		});
	});

	it("rejects reports that omit server memory observations", () => {
		const invalid = structuredClone(
			createPerformanceReport(
				scenarioNames.map((name) => ({ ...scenario(), name })),
			),
		);
		delete (invalid.scenarios[0] as Partial<PerformanceScenario>).memory;
		expect(() => performanceReportSchema.parse(invalid)).toThrow();
	});

	it("writes a schema-validated report with an explicit CI commit", () => {
		const previousCommit = process.env.GITHUB_SHA;
		process.env.GITHUB_SHA = "test-commit";
		try {
			writePerformanceReport(
				createPerformanceReport(
					scenarioNames.map((name) => ({ ...scenario(), name })),
				),
			);
			expect(
				JSON.parse(readFileSync(PERFORMANCE_SUMMARY_PATH, "utf8")),
			).toMatchObject({
				environment: { commit: "test-commit" },
			});
		} finally {
			if (previousCommit === undefined) delete process.env.GITHUB_SHA;
			else process.env.GITHUB_SHA = previousCommit;
			rmSync("test-results/performance", { force: true, recursive: true });
		}
	});
});
