import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const script = path.resolve("scripts/check-coverage-ratchet.mjs");
const metrics = ["statements", "lines", "functions", "branches"] as const;
const comparePaths = (left: string, right: string) =>
	left < right ? -1 : left > right ? 1 : 0;
type Metric = (typeof metrics)[number];
type Count = { covered: number; total: number };
type Counts = Record<Metric, Count>;

function allCounts(covered: number, total: number): Counts {
	return Object.fromEntries(
		metrics.map((metric) => [metric, { covered, total }]),
	) as Counts;
}

async function fixture(options?: {
	baseline?: Counts;
	current?: Counts;
	reportFiles?: string[];
	sourceFiles?: string[];
}) {
	const root = await mkdtemp(path.join(tmpdir(), "coverage-ratchet-"));
	const sourceFiles = options?.sourceFiles ?? ["src/a.ts", "src/nested/b.ts"];
	const reportFiles = options?.reportFiles ?? sourceFiles;
	const baselineCounts = options?.baseline ?? allCounts(90, 100);
	const currentCounts = options?.current ?? allCounts(91, 100);

	for (const file of sourceFiles) {
		await mkdir(path.dirname(path.join(root, file)), { recursive: true });
		await writeFile(path.join(root, file), "export {};\n");
	}

	const baseline = {
		schemaVersion: 1,
		sourcePolicy: {
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/generated/**"],
		},
		provenance: {
			mergedMainSha: "0123456789abcdef0123456789abcdef01234567",
			node: "v24.18.0",
			vitest: "4.1.10",
			command: "npm run test:coverage:collect",
		},
		files: [...sourceFiles].sort(comparePaths),
		metrics: baselineCounts,
	};

	const report: Record<string, Counts> & { total: Counts } = {
		total: currentCounts,
	};
	for (const [index, file] of reportFiles.entries()) {
		report[path.join(root, file)] = Object.fromEntries(
			metrics.map((metric) => [
				metric,
				index === 0 ? currentCounts[metric] : { covered: 0, total: 0 },
			]),
		) as Counts;
	}

	await writeFile(
		path.join(root, "coverage-baseline.json"),
		`${JSON.stringify(baseline)}\n`,
	);
	await mkdir(path.join(root, "coverage"), { recursive: true });
	await writeFile(
		path.join(root, "coverage/coverage-summary.json"),
		`${JSON.stringify(report)}\n`,
	);
	return root;
}

async function run(root: string) {
	try {
		const result = await execFileAsync(process.execPath, [
			script,
			"--root",
			root,
		]);
		return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
	} catch (error) {
		const failure = error as { code: number; stdout: string; stderr: string };
		return {
			exitCode: failure.code,
			stdout: failure.stdout,
			stderr: failure.stderr,
		};
	}
}

describe("coverage ratchet CLI", () => {
	it("passes an exact or superior complete report", async () => {
		const root = await fixture();
		const result = await run(root);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain(
			"Coverage denominator verified: 2 production files.",
		);
	});

	it("rejects an intentional coverage regression with a clear ratchet message", async () => {
		const root = await fixture({ current: allCounts(89, 100) });
		const result = await run(root);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("coverage ratchet failed");
		expect(result.stderr).toContain(
			"deliberately update coverage-baseline.json",
		);
	});

	it("reports missing denominator files and unexpected generated files", async () => {
		const root = await fixture({
			reportFiles: ["src/a.ts", "src/generated/client.ts"],
		});
		const result = await run(root);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain(
			"Missing intended source files:\n  src/nested/b.ts",
		);
		expect(result.stderr).toContain(
			"Unexpected coverage files:\n  src/generated/client.ts",
		);
	});

	it("uses exact cross multiplication instead of rounded percentages", async () => {
		const baseline = allCounts(90, 100);
		baseline.branches = { covered: 751, total: 1000 };
		const current = allCounts(91, 100);
		current.branches = { covered: 75_099, total: 100_000 };
		const root = await fixture({ baseline, current });
		const result = await run(root);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain(
			"branches coverage ratchet failed: current 75099/100000 (75.10%) is below baseline 751/1000 (75.10%)",
		);
	});

	it("rejects a one-unit regression near Number.MAX_SAFE_INTEGER", async () => {
		const baseline = allCounts(9_007_199_254_740_990, 9_007_199_254_740_991);
		const current = allCounts(9_007_199_254_740_989, 9_007_199_254_740_990);
		const root = await fixture({ baseline, current });
		const result = await run(root);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain(
			"statements coverage ratchet failed: current 9007199254740989/9007199254740990 (100.00%) is below baseline 9007199254740990/9007199254740991 (100.00%)",
		);
	});

	it("enforces permanent floors with integer arithmetic", async () => {
		const baseline = allCounts(90, 100);
		baseline.branches = { covered: 75, total: 100 };
		const current = allCounts(91, 100);
		current.branches = { covered: 7_499, total: 10_000 };
		const root = await fixture({ baseline, current });
		const result = await run(root);

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("below the permanent 75% floor");
	});
});
