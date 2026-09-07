/**
 * Release quality report (advisory only, never fails the release).
 *
 * Reads fta complexity JSON and the performance summary, then prints Markdown
 * tables for the GitHub job summary. Run after the performance lane:
 *
 *   pnpm exec fta packages --json > /tmp/fta.json
 *   node scripts/release-quality-report.mjs /tmp/fta.json test-results/performance/summary.json
 */
import { readFile } from "node:fs/promises";

const [, , ftaPath, perfPath] = process.argv;

function table(headers, rows) {
	const lines = [
		`| ${headers.join(" | ")} |`,
		`| ${headers.map(() => "---").join(" | ")} |`,
	];
	for (const row of rows) lines.push(`| ${row.join(" | ")} |`);
	return lines.join("\n");
}

const sections = ["## Release quality report", ""];

/* Complexity: worst non-generated files by cyclomatic complexity. */
try {
	const fta = JSON.parse(await readFile(ftaPath ?? "/tmp/fta.json", "utf8"));
	const rows = fta
		.filter((file) => !file.file_name.includes("/generated/"))
		.map((file) => ({
			file: file.file_name.replace(/^.*packages\//, "packages/"),
			cyclo: file.cyclo,
			lines: file.line_count,
			assessment: String(file.assessment ?? "").replace(/[()]/g, ""),
		}))
		.sort((left, right) => right.cyclo - left.cyclo)
		.slice(0, 15)
		.map((row) => [
			row.file,
			String(row.cyclo),
			String(row.lines),
			row.assessment,
		]);
	sections.push(
		"### Complexity hotspots (fta, top 15)",
		"",
		table(["file", "cyclo", "lines", "assessment"], rows),
		"",
	);
} catch {
	sections.push("### Complexity hotspots", "", "fta report unavailable.", "");
}

/* Performance: scenario latency overview from the deterministic suite. */
try {
	const perf = JSON.parse(
		await readFile(perfPath ?? "test-results/performance/summary.json", "utf8"),
	);
	const formatDuration = (value) =>
		value === null || value === undefined || Number.isNaN(value)
			? "\u2013"
			: String(Math.round(value));
	const rows = (perf.scenarios ?? []).map((scenario) => [
		scenario.name,
		formatDuration(scenario.durationsMs?.p50),
		formatDuration(scenario.durationsMs?.p95),
		String(scenario.correctness?.failureCount ?? "?"),
	]);
	sections.push(
		"### Performance scenarios (ms)",
		"",
		table(["scenario", "p50", "p95", "failures"], rows),
		"",
	);
} catch {
	sections.push(
		"### Performance scenarios",
		"",
		"Performance summary unavailable.",
		"",
	);
}

console.log(sections.join("\n"));
