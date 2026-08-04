import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	loadValidationLanes,
	repositoryRoot,
} from "./repository-control-plane.mjs";

export const validationLaneTableStart =
	"<!-- repository-control-plane:validation-lanes:start -->";
export const validationLaneTableEnd =
	"<!-- repository-control-plane:validation-lanes:end -->";

function renderList(values) {
	return values.length > 0 ? values.join(", ") : "—";
}

function renderPurpose(lane) {
	const selector = lane.selector;
	const details = [];

	if (selector.include?.length)
		details.push(`include: ${selector.include.join(", ")}`);
	if (selector.exclude?.length)
		details.push(`exclude: ${selector.exclude.join(", ")}`);
	if (selector.config) details.push(`config: ${selector.config}`);
	if (selector.workspace) details.push(`workspace: ${selector.workspace}`);
	if (selector.check) details.push(`check: ${selector.check}`);
	return [selector.kind, ...details].join("; ");
}

export function renderValidationLaneTable(manifest = loadValidationLanes()) {
	const rows = [
		[
			"Lane ID",
			"Command / integration",
			"Gate",
			"Runtime ownership",
			"Credentials",
			"Artifacts",
			"Purpose",
		],
	];
	for (const lane of manifest.lanes) {
		const command = lane.external
			? `external: ${lane.integration}`
			: `npm run ${lane.alias}`;
		rows.push([
			`\`${lane.id}\``,
			command,
			lane.gate,
			renderList(lane.runtimes),
			renderList(lane.credentials),
			renderList(lane.artifacts),
			renderPurpose(lane),
		]);
	}
	const widths = rows[0].map((_, index) =>
		Math.max(...rows.map((row) => row[index].length), 3),
	);
	const renderRow = (row) =>
		`| ${row.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;
	const separator = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
	return [
		validationLaneTableStart,
		"",
		renderRow(rows[0]),
		separator,
		...rows.slice(1).map(renderRow),
		"",
		validationLaneTableEnd,
	].join("\n");
}

export function replaceValidationLaneTable(contents, table) {
	const start = contents.indexOf(validationLaneTableStart);
	const end = contents.indexOf(validationLaneTableEnd);
	if (start < 0 || end < start)
		throw new Error(
			"Validation lane table markers are missing or out of order",
		);
	const endOffset = end + validationLaneTableEnd.length;
	return `${contents.slice(0, start)}${table}${contents.slice(endOffset)}`;
}

export async function checkRenderedValidationLaneTables(
	rootDir = repositoryRoot,
) {
	const manifest = loadValidationLanes(rootDir);
	const table = renderValidationLaneTable(manifest);
	const files = ["CONTRIBUTING.md", "docs/test-lanes.md"];
	for (const file of files) {
		const path = resolve(rootDir, file);
		const contents = await readFile(path, "utf8");
		const actual = replaceValidationLaneTable(contents, table);
		if (actual !== contents)
			throw new Error(`${file} validation lane table is stale; regenerate it`);
	}
}

export async function renderValidationLaneTables(rootDir = repositoryRoot) {
	const manifest = loadValidationLanes(rootDir);
	const table = renderValidationLaneTable(manifest);
	for (const file of ["CONTRIBUTING.md", "docs/test-lanes.md"]) {
		const path = resolve(rootDir, file);
		const contents = await readFile(path, "utf8");
		await writeFile(path, replaceValidationLaneTable(contents, table));
	}
}

export function isDirectInvocation(argvPath = process.argv[1]) {
	return Boolean(
		argvPath && resolve(argvPath) === fileURLToPath(import.meta.url),
	);
}

if (isDirectInvocation()) {
	try {
		if (process.argv.includes("--write")) await renderValidationLaneTables();
		else await checkRenderedValidationLaneTables();
	} catch (error) {
		console.error(`render-validation-lanes: ${error.message}`);
		process.exitCode = 1;
	}
}
