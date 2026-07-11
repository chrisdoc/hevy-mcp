#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const METRICS = ["statements", "lines", "functions", "branches"];
const FLOORS = { statements: 85n, lines: 85n, functions: 85n, branches: 75n };
const SOURCE_POLICY = {
	include: ["src/**/*.ts"],
	exclude: ["src/**/*.test.ts", "src/generated/**"],
};
const comparePaths = (left, right) =>
	left < right ? -1 : left > right ? 1 : 0;

function parseArguments(arguments_) {
	const defaults = {
		root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
	};
	const options = { ...defaults };
	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (!["--root", "--report", "--baseline"].includes(argument)) {
			throw new Error(`Unknown argument: ${argument}`);
		}
		const value = arguments_[index + 1];
		if (!value) throw new Error(`Missing value for ${argument}`);
		options[argument.slice(2)] = value;
		index += 1;
	}
	options.root = path.resolve(options.root);
	options.report = path.resolve(
		options.root,
		options.report ?? "coverage/coverage-summary.json",
	);
	options.baseline = path.resolve(
		options.root,
		options.baseline ?? "coverage-baseline.json",
	);
	return options;
}

function toPosix(value) {
	return value.split(path.sep).join("/");
}

function normalizeReportPath(root, value) {
	const absolute = path.isAbsolute(value) ? value : path.resolve(root, value);
	const relative = toPosix(path.relative(root, absolute));
	if (relative === ".." || relative.startsWith("../")) {
		throw new Error(`Coverage report path is outside the repository: ${value}`);
	}
	return relative;
}

async function enumerateTypeScriptFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory())
			files.push(...(await enumerateTypeScriptFiles(entryPath)));
		else if (entry.isFile() && entry.name.endsWith(".ts"))
			files.push(entryPath);
	}
	return files;
}

async function intendedFiles(root) {
	const sourceRoot = path.join(root, "src");
	return (await enumerateTypeScriptFiles(sourceRoot))
		.map((file) => toPosix(path.relative(root, file)))
		.filter(
			(file) =>
				!file.endsWith(".test.ts") && !file.startsWith("src/generated/"),
		)
		.sort(comparePaths);
}

async function readJson(file, label) {
	let contents;
	try {
		contents = await readFile(file, "utf8");
	} catch (error) {
		throw new Error(`Cannot read ${label} at ${file}: ${error.message}`);
	}
	try {
		return JSON.parse(contents);
	} catch (error) {
		throw new Error(`Invalid JSON in ${label} at ${file}: ${error.message}`);
	}
}

function validateCount(metric, value, label) {
	if (
		!value ||
		!Number.isSafeInteger(value.covered) ||
		!Number.isSafeInteger(value.total)
	) {
		throw new Error(
			`${label}.${metric} must contain safe integer covered and total counts`,
		);
	}
	if (value.covered < 0 || value.total < 0 || value.covered > value.total) {
		throw new Error(`${label}.${metric} must satisfy 0 <= covered <= total`);
	}
}

function validateMetrics(metrics, label) {
	if (!metrics || typeof metrics !== "object")
		throw new Error(`${label} metrics are missing`);
	for (const metric of METRICS) validateCount(metric, metrics[metric], label);
}

function sameStringArray(left, right) {
	return (
		Array.isArray(left) &&
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}

function validateBaseline(baseline) {
	if (baseline?.schemaVersion !== 1)
		throw new Error("coverage baseline schemaVersion must be 1");
	if (!/^[0-9a-f]{40}$/.test(baseline.provenance?.mergedMainSha ?? "")) {
		throw new Error(
			"coverage baseline provenance.mergedMainSha must be a full Git SHA",
		);
	}
	for (const field of ["node", "vitest", "command"]) {
		if (
			typeof baseline.provenance?.[field] !== "string" ||
			baseline.provenance[field].length === 0
		) {
			throw new Error(
				`coverage baseline provenance.${field} must be a non-empty string`,
			);
		}
	}
	if (!sameStringArray(baseline.sourcePolicy?.include, SOURCE_POLICY.include)) {
		throw new Error(
			`coverage baseline include policy must be ${JSON.stringify(SOURCE_POLICY.include)}`,
		);
	}
	if (!sameStringArray(baseline.sourcePolicy?.exclude, SOURCE_POLICY.exclude)) {
		throw new Error(
			`coverage baseline exclude policy must be ${JSON.stringify(SOURCE_POLICY.exclude)}`,
		);
	}
	if (
		!Array.isArray(baseline.files) ||
		!baseline.files.every((file) => typeof file === "string")
	) {
		throw new Error(
			"coverage baseline files must be an array of repository-relative paths",
		);
	}
	for (const file of baseline.files) {
		if (
			path.isAbsolute(file) ||
			file.includes("\\") ||
			file === ".." ||
			file.startsWith("../") ||
			!file.startsWith("src/") ||
			!file.endsWith(".ts") ||
			file.endsWith(".test.ts") ||
			file.startsWith("src/generated/")
		) {
			throw new Error(
				`coverage baseline contains a file outside the source policy: ${file}`,
			);
		}
	}
	const sortedFiles = [...baseline.files].sort(comparePaths);
	if (
		!sameStringArray(baseline.files, sortedFiles) ||
		new Set(baseline.files).size !== baseline.files.length
	) {
		throw new Error("coverage baseline files must be sorted and unique");
	}
	validateMetrics(baseline.metrics, "baseline");
	for (const metric of METRICS) {
		if (baseline.metrics[metric].total === 0)
			throw new Error(`baseline.${metric}.total must be greater than zero`);
	}
}

function reportFiles(root, report) {
	if (!report?.total || typeof report.total !== "object") {
		throw new Error("coverage report must contain a total summary");
	}
	const normalized = [];
	const sums = Object.fromEntries(
		METRICS.map((metric) => [metric, { covered: 0n, total: 0n }]),
	);
	for (const [file, summary] of Object.entries(report)) {
		if (file === "total") continue;
		validateMetrics(summary, `report file ${file}`);
		normalized.push(normalizeReportPath(root, file));
		for (const metric of METRICS) {
			sums[metric].covered += BigInt(summary[metric].covered);
			sums[metric].total += BigInt(summary[metric].total);
		}
	}
	if (new Set(normalized).size !== normalized.length) {
		throw new Error(
			"coverage report contains duplicate files after path normalization",
		);
	}
	for (const metric of METRICS) {
		if (
			BigInt(report.total[metric].covered) !== sums[metric].covered ||
			BigInt(report.total[metric].total) !== sums[metric].total
		) {
			throw new Error(
				`coverage report total.${metric} does not equal the sum of file counts`,
			);
		}
	}
	return normalized.sort(comparePaths);
}

function compareFileSets(expected, actual) {
	const expectedSet = new Set(expected);
	const actualSet = new Set(actual);
	return {
		missing: expected.filter((file) => !actualSet.has(file)),
		unexpected: actual.filter((file) => !expectedSet.has(file)),
	};
}

function formatRatio({ covered, total }) {
	return `${covered}/${total} (${((covered * 100) / total).toFixed(2)}%)`;
}

async function main() {
	const options = parseArguments(process.argv.slice(2));
	const [baseline, report, expectedFiles] = await Promise.all([
		readJson(options.baseline, "coverage baseline"),
		readJson(options.report, "coverage report"),
		intendedFiles(options.root),
	]);

	validateBaseline(baseline);
	validateMetrics(report.total, "report total");
	const actualFiles = reportFiles(options.root, report);
	const { missing, unexpected } = compareFileSets(expectedFiles, actualFiles);
	const failures = [];
	if (missing.length > 0)
		failures.push(`Missing intended source files:\n  ${missing.join("\n  ")}`);
	if (unexpected.length > 0)
		failures.push(`Unexpected coverage files:\n  ${unexpected.join("\n  ")}`);

	for (const metric of METRICS) {
		const current = report.total[metric];
		const baselineMetric = baseline.metrics[metric];
		if (current.total === 0) {
			failures.push(`${metric} coverage total is zero`);
			continue;
		}
		const currentCovered = BigInt(current.covered);
		const currentTotal = BigInt(current.total);
		const baselineCovered = BigInt(baselineMetric.covered);
		const baselineTotal = BigInt(baselineMetric.total);
		if (currentCovered * 100n < FLOORS[metric] * currentTotal) {
			failures.push(
				`${metric} coverage ${formatRatio(current)} is below the permanent ${FLOORS[metric]}% floor`,
			);
		}
		if (currentCovered * baselineTotal < baselineCovered * currentTotal) {
			failures.push(
				`${metric} coverage ratchet failed: current ${formatRatio(current)} is below baseline ${formatRatio(baselineMetric)}`,
			);
		}
	}

	if (failures.length > 0) {
		console.error(`Coverage ratchet failed:\n\n${failures.join("\n\n")}`);
		console.error(
			"\nFix the tests or implementation. If a regression is intentional and reviewed, deliberately update coverage-baseline.json with exact counts and merged-main provenance; do not add tolerance.",
		);
		process.exitCode = 1;
		return;
	}

	console.log(
		`Coverage denominator verified: ${actualFiles.length} production files.`,
	);
	for (const metric of METRICS) {
		console.log(
			`${metric}: ${formatRatio(report.total[metric])} (baseline ${formatRatio(baseline.metrics[metric])})`,
		);
	}
}

main().catch((error) => {
	console.error(`Coverage ratchet error: ${error.message}`);
	process.exitCode = 1;
});
