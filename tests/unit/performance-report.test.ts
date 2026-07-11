import { describe, expect, it } from "vitest";
import {
	createPerformanceReport,
	performanceReportSchema,
	percentile,
	summarizeDurations,
	type PerformanceScenario,
} from "../performance/report.js";

function scenario(): PerformanceScenario {
	return {
		name: "startup-initialization",
		iterations: 5,
		durationsMs: { p50: 3, p95: 5, max: 5 },
		correctness: { failureCount: 0, failures: [] },
		memory: {
			heapUsedBeforeBytes: 100,
			heapUsedAfterBytes: 120,
			heapUsedDeltaBytes: 20,
			rssBeforeBytes: 200,
			rssAfterBytes: 240,
			rssDeltaBytes: 40,
		},
		target: {
			description: "Informational startup target",
			p95Milliseconds: 2_000,
			informationalOnly: true,
		},
	};
}

describe("performance report statistics", () => {
	it("uses nearest-rank percentiles without mutating the sample", () => {
		const values = [5, 1, 4, 2, 3];

		expect(percentile(values, 0.5)).toBe(3);
		expect(percentile(values, 0.95)).toBe(5);
		expect(values).toEqual([5, 1, 4, 2, 3]);
	});

	it("summarizes p50, p95, and maximum durations", () => {
		const values = Array.from({ length: 20 }, (_, index) => index + 1);

		expect(summarizeDurations(values)).toEqual({
			p50: 10,
			p95: 19,
			max: 20,
		});
	});

	it("rejects invalid percentile inputs", () => {
		expect(() => percentile([], 0.5)).toThrow("empty sample");
		expect(() => percentile([1], 0)).toThrow("greater than 0");
	});
});

describe("performance report schema", () => {
	it("accepts a versioned report with reproducibility metadata", () => {
		const report = createPerformanceReport([scenario()]);

		expect(() => performanceReportSchema.parse(report)).not.toThrow();
		expect(report).toMatchObject({
			version: "1.0.0",
			configuration: {
				fixtureMode: "nock-local-mock",
				networkPolicy: "outbound-disabled",
				timingGate: "informational-only",
				observationWindow: "2-4 weeks",
			},
			correctness: { failureCount: 0 },
		});
		expect(report.environment.commit).not.toBe("");
		expect(report.environment.nodeVersion).toBe(process.version);
	});

	it("rejects reports that omit memory observations", () => {
		const invalid = structuredClone(createPerformanceReport([scenario()]));
		delete (invalid.scenarios[0] as Partial<PerformanceScenario>).memory;

		expect(() => performanceReportSchema.parse(invalid)).toThrow();
	});
});
