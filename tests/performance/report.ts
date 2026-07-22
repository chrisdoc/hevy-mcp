import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname } from "node:path";
import { z } from "zod";
import { fixtureResultSchema } from "./fixture-result.js";

export const PERFORMANCE_REPORT_VERSION = "2.0.0";
export const PERFORMANCE_SUMMARY_PATH = "test-results/performance/summary.json";

const durationStatisticsSchema = z.object({
	p50: z.number().positive(),
	p95: z.number().positive(),
	max: z.number().positive(),
});

const failureSchema = z.object({
	iteration: z.number().int().positive(),
	phase: z.enum(["setup", "operation", "iteration", "verification", "cleanup"]),
	message: z.string().min(1),
});

const runnerMemorySchema = z.object({
	heapUsedBeforeBytes: z.number().int().nonnegative(),
	heapUsedAfterBytes: z.number().int().nonnegative(),
	heapUsedDeltaBytes: z.number().int(),
	rssBeforeBytes: z.number().int().nonnegative(),
	rssAfterBytes: z.number().int().nonnegative(),
	rssDeltaBytes: z.number().int(),
});

const serverMemoryObservationSchema = z.object({
	iteration: z.number().int().positive(),
	phase: z.enum(["initialized", "scenario-complete"]),
	rssBytes: z.number().int().nonnegative().nullable(),
	unavailableReason: z.string().min(1).nullable(),
});

export const performanceScenarioSchema = z.object({
	name: z.enum([
		"startup-initialization",
		"mcp-tools-list",
		"representative-mocked-read",
		"concurrent-20-call-burst",
		"sequential-100-mocked-reads",
	]),
	configuredIterations: z.number().int().positive(),
	completedIterations: z.number().int().nonnegative(),
	durationsMs: durationStatisticsSchema,
	correctness: z.object({
		failureCount: z.number().int().nonnegative(),
		failures: z.array(failureSchema),
	}),
	fixtureVerification: z.object({
		processCount: z.number().int().nonnegative(),
		verifiedProcessCount: z.number().int().nonnegative(),
		results: z.array(fixtureResultSchema),
	}),
	memory: z.object({
		serverProcess: z.object({
			source: z.literal("/proc/<pid>/status VmRSS with nullable fallback"),
			observations: z.array(serverMemoryObservationSchema),
		}),
		parentRunner: runnerMemorySchema,
	}),
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
		builtCli: z.literal("packages/node/dist/cli.mjs"),
		transport: z.literal("spawned stdio"),
	}),
	configuration: z.object({
		fixtureMode: z.literal("child-local-nock-preload"),
		networkPolicy: z.literal("child-http-and-fetch-disabled"),
		timingGate: z.literal("informational-only"),
		observationWindow: z.literal("2-4 weeks"),
		buildExcludedFromSamples: z.literal(true),
	}),
	correctness: z.object({
		failureCount: z.number().int().nonnegative(),
		failures: z.array(
			failureSchema.extend({
				scenario: performanceScenarioSchema.shape.name,
			}),
		),
	}),
	scenarios: z.array(performanceScenarioSchema).length(5),
});

export type PerformanceFailure = z.infer<typeof failureSchema>;
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
	return sorted[index] ?? sorted[sorted.length - 1]!;
}

export function summarizeDurations(values: number[]) {
	return {
		p50: percentile(values, 0.5),
		p95: percentile(values, 0.95),
		max: Math.max(...values),
	};
}

export function observeRunnerMemory(
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
	if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
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
			builtCli: "packages/node/dist/cli.mjs",
			transport: "spawned stdio",
		},
		configuration: {
			fixtureMode: "child-local-nock-preload",
			networkPolicy: "child-http-and-fetch-disabled",
			timingGate: "informational-only",
			observationWindow: "2-4 weeks",
			buildExcludedFromSamples: true,
		},
		correctness: { failureCount: failures.length, failures },
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
