import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname } from "node:path";
import { z } from "zod";

export const PERFORMANCE_REPORT_VERSION = "1.0.0";
export const PERFORMANCE_SUMMARY_PATH = "test-results/performance/summary.json";

const durationStatisticsSchema = z.object({
	p50: z.number().nonnegative(),
	p95: z.number().nonnegative(),
	max: z.number().nonnegative(),
});

const memoryObservationSchema = z.object({
	heapUsedBeforeBytes: z.number().int().nonnegative(),
	heapUsedAfterBytes: z.number().int().nonnegative(),
	heapUsedDeltaBytes: z.number().int(),
	rssBeforeBytes: z.number().int().nonnegative(),
	rssAfterBytes: z.number().int().nonnegative(),
	rssDeltaBytes: z.number().int(),
});

const failureSchema = z.object({
	iteration: z.number().int().positive(),
	message: z.string().min(1),
});

export const performanceScenarioSchema = z.object({
	name: z.enum([
		"startup-initialization",
		"mcp-tools-list",
		"representative-mocked-read",
		"concurrent-20-call-burst",
		"sequential-100-mocked-reads",
	]),
	iterations: z.number().int().positive(),
	durationsMs: durationStatisticsSchema,
	correctness: z.object({
		failureCount: z.number().int().nonnegative(),
		failures: z.array(failureSchema),
	}),
	memory: memoryObservationSchema,
	target: z.object({
		description: z.string().min(1),
		p95Milliseconds: z.number().positive().nullable(),
		informationalOnly: z.literal(true),
	}),
});

export const performanceReportSchema = z.object({
	version: z.literal(PERFORMANCE_REPORT_VERSION),
	generatedAt: z.iso.datetime(),
	environment: z.object({
		ci: z.boolean(),
		platform: z.string().min(1),
		arch: z.string().min(1),
		nodeVersion: z.string().min(1),
		cpuModel: z.string().min(1),
		cpuCount: z.number().int().positive(),
		runner: z.string().min(1),
		commit: z.string().min(1),
	}),
	configuration: z.object({
		fixtureMode: z.literal("nock-local-mock"),
		networkPolicy: z.literal("outbound-disabled"),
		timingGate: z.literal("informational-only"),
		observationWindow: z.literal("2-4 weeks"),
	}),
	correctness: z.object({
		failureCount: z.number().int().nonnegative(),
		failures: z.array(
			failureSchema.extend({
				scenario: performanceScenarioSchema.shape.name,
			}),
		),
	}),
	scenarios: z.array(performanceScenarioSchema).min(1).max(5),
});

export type PerformanceScenario = z.infer<typeof performanceScenarioSchema>;
export type PerformanceReport = z.infer<typeof performanceReportSchema>;

export function percentile(values: number[], fraction: number) {
	if (values.length === 0) {
		throw new Error("Cannot calculate a percentile for an empty sample");
	}
	if (fraction <= 0 || fraction > 1) {
		throw new Error("Percentile fraction must be greater than 0 and at most 1");
	}

	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.ceil(fraction * sorted.length) - 1;
	return sorted[index] ?? sorted[sorted.length - 1] ?? 0;
}

export function summarizeDurations(values: number[]) {
	return {
		p50: percentile(values, 0.5),
		p95: percentile(values, 0.95),
		max: Math.max(...values),
	};
}

export function observeMemory(
	before: NodeJS.MemoryUsage,
	after: NodeJS.MemoryUsage,
) {
	return {
		heapUsedBeforeBytes: before.heapUsed,
		heapUsedAfterBytes: after.heapUsed,
		heapUsedDeltaBytes: after.heapUsed - before.heapUsed,
		rssBeforeBytes: before.rss,
		rssAfterBytes: after.rss,
		rssDeltaBytes: after.rss - before.rss,
	};
}

function getCommit() {
	if (process.env.GITHUB_SHA) {
		return process.env.GITHUB_SHA;
	}

	try {
		return execFileSync("git", ["rev-parse", "HEAD"], {
			encoding: "utf8",
		}).trim();
	} catch {
		return "unknown";
	}
}

export function createPerformanceReport(
	scenarios: PerformanceScenario[],
): PerformanceReport {
	const cpu = os.cpus();
	const failures = scenarios.flatMap((scenario) =>
		scenario.correctness.failures.map((failure) => ({
			...failure,
			scenario: scenario.name,
		})),
	);

	return performanceReportSchema.parse({
		version: PERFORMANCE_REPORT_VERSION,
		generatedAt: new Date().toISOString(),
		environment: {
			ci: process.env.CI === "true",
			platform: process.platform,
			arch: process.arch,
			nodeVersion: process.version,
			cpuModel: cpu[0]?.model ?? "unknown",
			cpuCount: Math.max(cpu.length, 1),
			runner: process.env.RUNNER_NAME ?? process.env.RUNNER_OS ?? os.hostname(),
			commit: getCommit(),
		},
		configuration: {
			fixtureMode: "nock-local-mock",
			networkPolicy: "outbound-disabled",
			timingGate: "informational-only",
			observationWindow: "2-4 weeks",
		},
		correctness: {
			failureCount: failures.length,
			failures,
		},
		scenarios,
	});
}

export function writePerformanceReport(report: PerformanceReport) {
	const validated = performanceReportSchema.parse(report);
	mkdirSync(dirname(PERFORMANCE_SUMMARY_PATH), { recursive: true });
	writeFileSync(
		PERFORMANCE_SUMMARY_PATH,
		`${JSON.stringify(validated, null, 2)}\n`,
	);
}
