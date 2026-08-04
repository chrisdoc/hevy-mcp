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
export const validationAggregateTableStart =
	"<!-- repository-control-plane:validation-aggregates:start -->";
export const validationAggregateTableEnd =
	"<!-- repository-control-plane:validation-aggregates:end -->";

const documentationFiles = ["CONTRIBUTING.md", "docs/test-lanes.md"];

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

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
	if (selector.project) details.push(`project: ${selector.project}`);
	if (selector.check) details.push(`check: ${selector.check}`);
	return [selector.kind, ...details].join("; ");
}

function validateLane(lane, index) {
	assert(
		lane && typeof lane === "object",
		`validation lane ${index} is required`,
	);
	assert(
		typeof lane.id === "string" && lane.id.length > 0,
		`validation lane ${index} needs an id`,
	);
	assert(
		!Object.prototype.hasOwnProperty.call(lane, "command"),
		`${lane.id} must not encode dispatcher commands`,
	);
	assert(
		lane.selector && typeof lane.selector === "object",
		`${lane.id} selector is required`,
	);
	assert(
		typeof lane.gate === "string" && lane.gate.length > 0,
		`${lane.id} gate is required`,
	);
	assert(Array.isArray(lane.runtimes), `${lane.id}.runtimes must be an array`);
	assert(
		Array.isArray(lane.credentials),
		`${lane.id}.credentials must be an array`,
	);
	assert(
		Array.isArray(lane.artifacts),
		`${lane.id}.artifacts must be an array`,
	);
	assert(
		typeof lane.mappingStatus === "string",
		`${lane.id}.mappingStatus is required`,
	);
	if (lane.external === true) {
		assert(
			typeof lane.integration === "string" && lane.integration.length > 0,
			`${lane.id} external lanes need integration ownership`,
		);
		assert(
			lane.alias === undefined,
			`${lane.id} external lanes must not advertise an alias`,
		);
		assert(
			lane.nxTarget === null,
			`${lane.id} external lanes must not advertise an Nx target`,
		);
		return;
	}
	if (lane.alias !== undefined)
		assert(
			typeof lane.alias === "string" && lane.alias.length > 0,
			`${lane.id} alias must be a non-empty string`,
		);
	if (lane.mappingStatus === "mapped")
		assert(
			typeof lane.nxTarget === "string" && lane.nxTarget.length > 0,
			`${lane.id} mapped lanes need an Nx target`,
		);
	else
		assert(
			lane.nxTarget === null,
			`${lane.id} non-mapped lanes must not advertise an Nx target`,
		);
}

function validateManifest(manifest) {
	assert(
		manifest && typeof manifest === "object",
		"validation lanes are required",
	);
	assert(Array.isArray(manifest.lanes), "validation lanes must be an array");
	assert(
		manifest.aggregates && typeof manifest.aggregates === "object",
		"validation aggregates are required",
	);
	const laneIds = new Set();
	for (const [index, lane] of manifest.lanes.entries()) {
		validateLane(lane, index);
		assert(!laneIds.has(lane.id), `validation lane id duplicated: ${lane.id}`);
		laneIds.add(lane.id);
	}
	const aggregateIds = new Set(Object.keys(manifest.aggregates));
	for (const [id, aggregate] of Object.entries(manifest.aggregates)) {
		assert(
			aggregate && typeof aggregate === "object",
			`${id} aggregate is required`,
		);
		assertArray(aggregate.lanes, `aggregate ${id}.lanes`);
		assert(
			typeof aggregate.mappingStatus === "string",
			`${id}.mappingStatus is required`,
		);
		for (const member of aggregate.lanes)
			assert(
				laneIds.has(member) || aggregateIds.has(member),
				`${id} references unknown lane or aggregate ${member}`,
			);
		if (aggregate.external === true) {
			assert(
				aggregate.mappingStatus === "external",
				`${id} external aggregates must use external mapping`,
			);
			assert(
				typeof aggregate.integration === "string" &&
					aggregate.integration.length > 0,
				`${id} external aggregates need integration ownership`,
			);
			assert(
				aggregate.alias === undefined,
				`${id} external aggregates must not advertise an alias`,
			);
		} else if (aggregate.mappingStatus === "mapped")
			assert(
				typeof aggregate.nxTarget === "string" && aggregate.nxTarget.length > 0,
				`${id} mapped aggregates need an Nx target`,
			);
		else
			assert(
				aggregate.nxTarget === null,
				`${id} non-mapped aggregates must not advertise an Nx target`,
			);
	}
	validateAggregateAcyclicity(manifest.aggregates);
	return manifest;
}

function assertArray(value, label) {
	assert(Array.isArray(value), `${label} must be an array`);
}

function validateAggregateAcyclicity(aggregates) {
	const visiting = new Set();
	const visited = new Set();
	const visit = (id, stack) => {
		if (visiting.has(id))
			throw new Error(
				`Validation aggregate cycle: ${[...stack, id].join(" -> ")}`,
			);
		if (visited.has(id)) return;
		const aggregate = aggregates[id];
		if (!aggregate) return;
		visiting.add(id);
		for (const member of aggregate.lanes) {
			if (aggregates[member]) visit(member, [...stack, id]);
		}
		visiting.delete(id);
		visited.add(id);
	};
	for (const id of Object.keys(aggregates)) visit(id, []);
}

function renderMarkdownTable(rows) {
	const widths = rows[0].map((_, index) =>
		Math.max(...rows.map((row) => row[index].length), 3),
	);
	const renderRow = (row) =>
		`| ${row.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;
	const separator = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
	return [renderRow(rows[0]), separator, ...rows.slice(1).map(renderRow)].join(
		"\n",
	);
}

function renderNxTarget(target) {
	return target ? `npx nx run repository:${target}` : "—";
}

function renderLaneCommand(lane) {
	if (lane.external === true) return `external: ${lane.integration}`;
	const command = lane.alias
		? `npm run ${lane.alias}`
		: renderNxTarget(lane.nxTarget);
	assert(command !== "—", `${lane.id} has no contributor command or Nx target`);
	return lane.alias && lane.nxTarget
		? `${command} (Nx: repository:${lane.nxTarget})`
		: command;
}

function renderAggregateCommand(aggregate, id) {
	if (aggregate.external === true) {
		assert(
			typeof aggregate.integration === "string" &&
				aggregate.integration.length > 0,
			`${id} external aggregates need integration ownership`,
		);
		return `external: ${aggregate.integration}`;
	}
	if (aggregate.alias !== undefined) {
		assert(
			typeof aggregate.alias === "string" && aggregate.alias.length > 0,
			`${id} alias must be a non-empty string`,
		);
		return aggregate.nxTarget
			? `npm run ${aggregate.alias} (Nx: repository:${aggregate.nxTarget})`
			: `npm run ${aggregate.alias}`;
	}
	return renderNxTarget(aggregate.nxTarget);
}

function renderLaneTableBody(manifest) {
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
		rows.push([
			`\`${lane.id}\``,
			renderLaneCommand(lane),
			lane.gate,
			renderList(lane.runtimes),
			renderList(lane.credentials),
			renderList(lane.artifacts),
			renderPurpose(lane),
		]);
	}
	return renderMarkdownTable(rows);
}

export function renderValidationAggregateTable(
	manifest = loadValidationLanes(),
) {
	validateManifest(manifest);
	const rows = [
		["Aggregate ID", "Nx target / command", "Members", "Count", "Mapping"],
	];
	for (const [id, aggregate] of Object.entries(manifest.aggregates)) {
		rows.push([
			`\`${id}\``,
			renderAggregateCommand(aggregate, id),
			aggregate.lanes.map((member) => `\`${member}\``).join(", ") || "—",
			String(aggregate.lanes.length),
			aggregate.mappingStatus,
		]);
	}
	return [
		validationAggregateTableStart,
		"",
		renderMarkdownTable(rows),
		"",
		validationAggregateTableEnd,
	].join("\n");
}

export function renderValidationLaneTable(manifest = loadValidationLanes()) {
	validateManifest(manifest);
	return [
		validationLaneTableStart,
		"",
		renderLaneTableBody(manifest),
		"",
		renderValidationAggregateTable(manifest),
		"",
		validationLaneTableEnd,
	].join("\n");
}

function replaceMarkedTable(contents, startMarker, endMarker, table, label) {
	const starts = [
		...contents.matchAll(new RegExp(escapeRegExp(startMarker), "g")),
	];
	const ends = [...contents.matchAll(new RegExp(escapeRegExp(endMarker), "g"))];
	if (
		starts.length === 0 ||
		ends.length === 0 ||
		starts[0].index > ends[0].index
	)
		throw new Error(`${label} markers are missing or out of order`);
	if (starts.length !== 1 || ends.length !== 1)
		throw new Error(`${label} markers are duplicated`);
	const endOffset = ends[0].index + endMarker.length;
	return `${contents.slice(0, starts[0].index)}${table}${contents.slice(endOffset)}`;
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replaceValidationLaneTable(contents, table) {
	return replaceMarkedTable(
		contents,
		validationLaneTableStart,
		validationLaneTableEnd,
		table,
		"Validation lane table",
	);
}

export function replaceValidationAggregateTable(contents, table) {
	return replaceMarkedTable(
		contents,
		validationAggregateTableStart,
		validationAggregateTableEnd,
		table,
		"Validation aggregate table",
	);
}

export async function checkRenderedValidationLaneTables(
	rootDir = repositoryRoot,
) {
	const manifest = validateManifest(loadValidationLanes(rootDir));
	const table = renderValidationLaneTable(manifest);
	for (const file of documentationFiles) {
		const path = resolve(rootDir, file);
		const contents = await readFile(path, "utf8");
		const actual = replaceValidationLaneTable(contents, table);
		if (actual !== contents)
			throw new Error(`${file} validation lane table is stale; regenerate it`);
	}
}

export async function renderValidationLaneTables(rootDir = repositoryRoot) {
	const manifest = validateManifest(loadValidationLanes(rootDir));
	const table = renderValidationLaneTable(manifest);
	for (const file of documentationFiles) {
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
