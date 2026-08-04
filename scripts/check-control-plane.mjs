import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	resolveImpactedLanes,
	validateControlPlane,
} from "./repository-control-plane.mjs";
import { checkRenderedValidationLaneTables } from "./render-validation-lanes.mjs";
import {
	assertWorkflowProjection,
	parseWorkflowLaneExecutions,
} from "./workflow-projections.mjs";
import {
	historicalSource,
	validateHistoricalRegistryFragments,
} from "./control-plane-baseline.mjs";

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
	assert(
		JSON.stringify(actual) === JSON.stringify(expected),
		`${message}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(
			actual,
		)}`,
	);
}

function readText(path) {
	return readFileSync(resolve(path), "utf8");
}

function countSubstring(source, substring) {
	let count = 0;
	let offset = 0;
	while (true) {
		const index = source.indexOf(substring, offset);
		if (index === -1) return count;
		const end = index + substring.length;
		if (end === source.length || /\s/.test(source[end])) count += 1;
		offset = index + substring.length;
	}
}

function lineContainsCommand(line, command) {
	const index = line.indexOf(command);
	if (index === -1) return false;
	const end = index + command.length;
	return end === line.length || /\s/.test(line[end]);
}

const historicalExecutionBuckets = {
	testPr: {
		path: "package.json",
		count(source) {
			const packageJson = JSON.parse(source);
			const script = packageJson.scripts?.["test:pr"];
			assert(
				typeof script === "string",
				"Historical test:pr script is required for execution evidence",
			);
			return [...script.matchAll(/npm run [a-z0-9:-]+/g)].length;
		},
	},
	pullRequestWorkflow: {
		path: ".github/workflows/build-and-test.yml",
		count(source) {
			return source
				.split("\n")
				.filter((line) => /^\s*(?:-?\s*run:\s*)?npm run [a-z0-9:-]+/.test(line))
				.length;
		},
	},
	releaseWorkflow: {
		path: ".github/workflows/release.yml",
		count(source) {
			return source
				.split("\n")
				.filter((line) =>
					/^\s*-?\s*run:\s*(?:npm run [a-z0-9:-]+|npx vitest run|node tests\/nightly\/)/.test(
						line,
					),
				).length;
		},
	},
};

export function validateHistoricalEvidence(baseline) {
	const evidence = baseline.before.validationExecutionLines;
	assert(
		/^[0-9a-f]{40}$/.test(evidence.sourceRevision),
		"Historical execution evidence needs a full immutable source revision",
	);
	const sourceCache = new Map();
	const sourceLines = (path) => {
		if (!sourceCache.has(path))
			sourceCache.set(
				path,
				historicalSource(evidence.sourceRevision, path).split("\n"),
			);
		return sourceCache.get(path);
	};
	const historicalPackage = JSON.parse(
		historicalSource(evidence.sourceRevision, "package.json"),
	);
	const historicalTestPr = historicalPackage.scripts?.["test:pr"];
	assert(
		typeof historicalTestPr === "string",
		"Historical test:pr script is required for execution evidence",
	);
	for (const [bucket, source] of Object.entries(historicalExecutionBuckets)) {
		const sourceCount = source.count(
			historicalSource(evidence.sourceRevision, source.path),
		);
		assert(
			sourceCount === evidence[bucket]?.length,
			`Historical ${bucket} execution count drifted from its immutable source`,
		);
	}
	for (const bucket of ["testPr", "pullRequestWorkflow", "releaseWorkflow"]) {
		assert(
			Array.isArray(evidence[bucket]),
			`Historical ${bucket} evidence is required`,
		);
		for (const entry of evidence[bucket]) {
			assert(
				typeof entry.lane === "string" &&
					typeof entry.command === "string" &&
					entry.source &&
					typeof entry.source.path === "string" &&
					Number.isInteger(entry.source.line) &&
					entry.source.line > 0,
				`Historical ${bucket} entries need lane, command, and source location`,
			);
			const lines = sourceLines(entry.source.path);
			assert(
				entry.source.line <= lines.length &&
					lines[entry.source.line - 1].includes(entry.command),
				`Historical ${bucket} evidence does not match ${entry.source.path}:${entry.source.line}`,
			);
		}
		const bySourceAndCommand = new Map();
		for (const entry of evidence[bucket]) {
			const key = `${entry.source.path}\0${entry.command}`;
			const entries = bySourceAndCommand.get(key) ?? [];
			entries.push(entry);
			bySourceAndCommand.set(key, entries);
		}
		for (const [key, entries] of bySourceAndCommand) {
			const [path, command] = key.split("\0");
			const declaredLines = entries.map((entry) => entry.source.line);
			assert(
				new Set(declaredLines).size === declaredLines.length,
				`Historical ${bucket} evidence declares ${command} more than once at ${path}`,
			);
			const occurrences =
				path === "package.json"
					? countSubstring(historicalTestPr, command)
					: sourceLines(path).filter((line) =>
							lineContainsCommand(line, command),
						).length;
			assert(
				occurrences === entries.length,
				`Historical ${bucket} evidence count for ${command} drifted from ${path}`,
			);
		}
	}
	const testPrCommands = [
		...(historicalTestPr.matchAll(/npm run [a-z0-9:-]+/g) ?? []),
	].map((match) => match[0]);
	assertEqual(
		evidence.testPr.map((entry) => entry.command),
		testPrCommands,
		"Historical test:pr lane commands drifted from its immutable source",
	);
	return {
		testPrMembers: evidence.testPr.length,
		pullRequestWorkflow: evidence.pullRequestWorkflow.length,
		releaseWorkflow: evidence.releaseWorkflow.length,
		total:
			evidence.testPr.length +
			evidence.pullRequestWorkflow.length +
			evidence.releaseWorkflow.length,
	};
}

export function validateHistoricalExecutionTotals(actual, expected) {
	for (const field of [
		"testPrMembers",
		"pullRequestWorkflow",
		"releaseWorkflow",
		"total",
	]) {
		assert(
			Number.isInteger(expected?.[field]) && expected[field] >= 0,
			`Before validation execution baseline ${field} must be a non-negative integer`,
		);
		assertEqual(
			actual?.[field],
			expected[field],
			`Before validation execution ${field} drifted from the recorded baseline`,
		);
	}
}

export async function checkControlPlane() {
	const controlPlane = validateControlPlane();
	const baseline = JSON.parse(
		readFileSync(resolve("repository", "control-plane-baseline.json"), "utf8"),
	);
	const canonicalModels = [
		{ id: "topology", path: "repository/topology.json" },
		{ id: "artifact-provenance", path: "repository/artifact-provenance.json" },
		{ id: "validation-lanes", path: "repository/validation-lanes.json" },
	];
	assertEqual(
		canonicalModels.filter(({ path }) => existsSync(resolve(path))),
		baseline.after.canonicalModels,
		"Canonical model identities drifted from baseline",
	);
	assertEqual(
		controlPlane.lanes.lanes.map((lane) => lane.id),
		baseline.after.validationLaneIdentities,
		"Validation lane identities drifted from baseline",
	);
	assert(
		baseline.after.validationLaneDefinitions ===
			controlPlane.lanes.lanes.length,
		"Validation lane definition count drifted from the checked baseline",
	);

	const registryConsumers = [
		"scripts/check-workspaces.mjs",
		"scripts/check-package-boundaries.mjs",
		"scripts/check-package-exports.mjs",
		"scripts/check-release-candidates.mjs",
		"scripts/check-package-changesets.mjs",
		"scripts/release-outputs.mjs",
		"scripts/check-worker-bundle.mjs",
		"scripts/server-manifest.mjs",
	];
	const unlinkedConsumers = registryConsumers.filter(
		(file) => !readText(file).includes("repository-control-plane"),
	);
	const retiredFragments = [];
	const retiredWorkerChecker = "scripts/check-worker-import-boundary.mjs";
	if (existsSync(resolve(retiredWorkerChecker)))
		retiredFragments.push(retiredWorkerChecker);
	const legacyRegistryFragments = [...unlinkedConsumers, ...retiredFragments];
	assertEqual(
		legacyRegistryFragments,
		baseline.after.legacyRegistryFragments,
		"Legacy registry identities drifted from baseline",
	);
	const historicalRegistryFragmentCount = validateHistoricalRegistryFragments(
		baseline.before.registryFragments,
		{
			expectedRevision: baseline.before.validationExecutionLines.sourceRevision,
			sourceReader: (revision, path) => historicalSource(revision, path),
		},
	);
	assert(
		historicalRegistryFragmentCount === 11,
		"Before baseline must retain all eleven unique fragment identities",
	);

	const buildWorkflow = readText(".github/workflows/build-and-test.yml");
	const releaseWorkflow = readText(".github/workflows/release.yml");
	const projections = controlPlane.lanes.workflowProjections;
	const buildProjection = parseWorkflowLaneExecutions(buildWorkflow);
	const releaseProjection = parseWorkflowLaneExecutions(releaseWorkflow);
	assertWorkflowProjection(
		buildProjection,
		projections["pull-request"],
		"Pull-request workflow projection",
	);
	assertWorkflowProjection(
		releaseProjection,
		projections.release,
		"Release workflow projection",
	);
	const buildIdentities = buildProjection.map((entry) => entry.lane);
	const releaseIdentities = releaseProjection.map((entry) => entry.lane);
	assertEqual(
		controlPlane.lanes.aggregates["pull-request"].lanes,
		baseline.after.validationExecutionLines.identities.testPr,
		"Pull-request aggregate lane identities drifted from baseline",
	);
	assertEqual(
		buildIdentities,
		baseline.after.validationExecutionLines.identities.pullRequestWorkflow,
		"Pull-request workflow identities drifted from baseline",
	);
	assertEqual(
		releaseIdentities,
		baseline.after.validationExecutionLines.identities.releaseWorkflow,
		"Release workflow identities drifted from baseline",
	);
	const pullRequestMembers =
		controlPlane.lanes.aggregates["pull-request"].lanes.length;
	const buildExecutionLines = buildIdentities.length;
	const releaseExecutionLines = releaseIdentities.length;
	const afterExecution = baseline.after.validationExecutionLines;
	assert(
		afterExecution.testPrMembers === pullRequestMembers,
		"Pull-request aggregate member count drifted from baseline",
	);
	assert(
		afterExecution.pullRequestWorkflow === buildExecutionLines,
		"Pull-request workflow execution count drifted from baseline",
	);
	assert(
		afterExecution.releaseWorkflow === releaseExecutionLines,
		"Release workflow execution count drifted from baseline",
	);
	assert(
		afterExecution.total ===
			pullRequestMembers + buildExecutionLines + releaseExecutionLines,
		"After validation execution total is not reproducible from live identities",
	);
	const beforeExecution = validateHistoricalEvidence(baseline);
	validateHistoricalExecutionTotals(
		beforeExecution,
		baseline.before.validationExecutionLines.counts,
	);

	assertEqual(
		controlPlane.lanes.aggregates.release.lanes,
		projections.release.map((entry) => entry.lane),
		"Release aggregate lane identities drifted from release workflow projection",
	);
	await checkRenderedValidationLaneTables();
	if (existsSync(resolve(retiredWorkerChecker)))
		throw new Error("Retired regex Worker boundary checker still exists");

	const wildcardRoute = controlPlane.lanes.changeImpactRouting?.find(
		(route) => route.pattern === "**/*",
	);
	if (!wildcardRoute || wildcardRoute.lanes.length === 0)
		throw new Error(
			"Validation lane change-impact routing needs a non-empty **/* fallback",
		);

	const renameLanes = resolveImpactedLanes(controlPlane.lanes, [
		{
			status: "R100",
			oldPath: "packages/core/src/old.ts",
			newPath: "packages/core/src/new.ts",
		},
		{ status: "D", path: "packages/worker/src/removed.ts" },
	]);
	for (const lane of ["core", "worker"]) {
		if (lane === "core" && !renameLanes.includes("unit"))
			throw new Error("Rename routing does not include core unit validation");
		if (lane === "worker" && !renameLanes.includes("worker"))
			throw new Error("Deletion routing does not include Worker validation");
	}

	console.log(
		`Repository control plane is valid (${controlPlane.topology.workspaces.length} workspaces, ${controlPlane.lanes.lanes.length} validation lanes, ${controlPlane.provenance.candidates.length} candidates).`,
	);
}

const isCli =
	process.argv[1] !== undefined &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isCli) {
	try {
		await checkControlPlane();
	} catch (error) {
		console.error(`check-control-plane: ${error.message}`);
		process.exitCode = 1;
	}
}
