import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flattenAggregateLanes } from "./control-plane-validation.mjs";

export const HISTORICAL_REGISTRY_REVISION =
	"f2e7af0ee3a02b6a0c6fa7820895db3882b7be4c";

export const HISTORICAL_AGGREGATE_IDENTITIES = Object.freeze({
	"pull-request": Object.freeze([
		"unit",
		"mocked-mcp",
		"contract",
		"stdio",
		"worker",
		"worker-http",
		"pack",
		"cli",
		"pack-cli",
	]),
	release: Object.freeze([
		"build",
		"release-unit",
		"pack",
		"release-integration",
		"nightly",
		"worker-http-live",
	]),
});

export const HISTORICAL_REGISTRY_FRAGMENTS = Object.freeze([
	{
		id: "workspace-identities",
		path: "scripts/check-workspaces.mjs",
		symbol: "expected",
		sourceRevision: HISTORICAL_REGISTRY_REVISION,
		line: 5,
	},
	{
		id: "boundary-package-rules",
		path: "scripts/check-package-boundaries.mjs",
		symbol: "packageRules",
		sourceRevision: HISTORICAL_REGISTRY_REVISION,
		line: 10,
	},
	{
		id: "boundary-internal-packages",
		path: "scripts/check-package-boundaries.mjs",
		symbol: "internalPackages",
		sourceRevision: HISTORICAL_REGISTRY_REVISION,
		line: 60,
	},
	{
		id: "worker-entry-registry",
		path: "scripts/check-worker-import-boundary.mjs",
		symbol: "workerEntries",
		sourceRevision: HISTORICAL_REGISTRY_REVISION,
		line: 5,
	},
	{
		id: "worker-builtins-registry",
		path: "scripts/check-worker-import-boundary.mjs",
		symbol: "nodeBuiltins",
		sourceRevision: HISTORICAL_REGISTRY_REVISION,
		line: 6,
	},
	{
		id: "worker-forbidden-source-files",
		path: "scripts/check-worker-import-boundary.mjs",
		symbol: "forbiddenSourceFiles",
		sourceRevision: HISTORICAL_REGISTRY_REVISION,
		line: 48,
	},
	{
		id: "worker-forbidden-packages",
		path: "scripts/check-worker-import-boundary.mjs",
		symbol: "forbiddenPackages",
		sourceRevision: HISTORICAL_REGISTRY_REVISION,
		line: 59,
	},
	{
		id: "package-export-map",
		path: "scripts/check-package-exports.mjs",
		symbol: "expected",
		sourceRevision: HISTORICAL_REGISTRY_REVISION,
		line: 5,
	},
	{
		id: "publishable-workspaces",
		path: "scripts/check-release-candidates.mjs",
		symbol: "expectedPublishable",
		sourceRevision: HISTORICAL_REGISTRY_REVISION,
		line: 15,
	},
	{
		id: "release-triggers",
		path: "scripts/check-package-changesets.mjs",
		symbol: "releaseTriggerFiles",
		sourceRevision: HISTORICAL_REGISTRY_REVISION,
		line: 14,
	},
	{
		id: "bundled-release-graph",
		path: "scripts/check-package-changesets.mjs",
		symbol: "bundledReleaseGraph",
		sourceRevision: HISTORICAL_REGISTRY_REVISION,
		line: 17,
	},
]);

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function assertArray(value, label) {
	assert(Array.isArray(value), label + " must be an array");
}

function assertUnique(values, label) {
	const duplicates = values.filter(
		(value, index) => values.indexOf(value) !== index,
	);
	assert(
		duplicates.length === 0,
		label + " contains duplicates: " + [...new Set(duplicates)].join(", "),
	);
}

function fragmentCoordinates(fragments) {
	return fragments.map(({ id, path, symbol, sourceRevision, line }) => ({
		id,
		path,
		symbol,
		sourceRevision,
		line,
	}));
}

function assertIdentityArray(actual, expected, label) {
	assert(
		JSON.stringify(actual) === JSON.stringify(expected),
		label + " drifted from canonical evidence",
	);
}

export function historicalSource(revision, path, cwd = process.cwd()) {
	try {
		return execFileSync("git", ["show", revision + ":" + path], {
			cwd,
			encoding: "utf8",
		});
	} catch (error) {
		throw new Error(
			"Historical baseline source " +
				revision +
				":" +
				path +
				" is unavailable: " +
				error.message,
		);
	}
}

function declarationMatches(line, symbol) {
	if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(symbol)) return false;
	const escaped = symbol.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
	return new RegExp(
		"(?:^|\\b)(?:export\\s+)?(?:const|let|var|function|class)\\s+" +
			escaped +
			"\\b",
	).test(line);
}

export function validateHistoricalRegistryFragments(
	fragments,
	{
		expectedRevision = HISTORICAL_REGISTRY_REVISION,
		sourceReader = historicalSource,
	} = {},
) {
	assertArray(fragments, "Historical registry fragments");
	assert(
		expectedRevision === HISTORICAL_REGISTRY_REVISION,
		"Historical registry evidence needs the exact immutable source revision",
	);
	assertIdentityArray(
		fragmentCoordinates(fragments),
		HISTORICAL_REGISTRY_FRAGMENTS,
		"Historical registry fragments",
	);
	assertUnique(
		fragments.map((fragment) => fragment?.id),
		"Historical registry fragment ids",
	);
	assertUnique(
		fragments.map(
			(fragment) =>
				fragment?.sourceRevision +
				"\0" +
				fragment?.path +
				"\0" +
				fragment?.line +
				"\0" +
				fragment?.symbol,
		),
		"Historical registry fragment coordinates",
	);
	for (const fragment of fragments) {
		assert(
			fragment &&
				typeof fragment.id === "string" &&
				typeof fragment.path === "string" &&
				typeof fragment.symbol === "string" &&
				Number.isInteger(fragment.line) &&
				fragment.line > 0 &&
				fragment.sourceRevision === expectedRevision,
			"Historical registry fragment " +
				(fragment?.id || "?") +
				" needs immutable revision, path, symbol, and line",
		);
		let source;
		try {
			source = sourceReader(fragment.sourceRevision, fragment.path);
		} catch (error) {
			throw new Error(
				"Historical registry fragment " +
					fragment.id +
					" source is unavailable: " +
					error.message,
			);
		}
		const lines = String(source).split("\n");
		assert(
			fragment.line <= lines.length &&
				declarationMatches(lines[fragment.line - 1], fragment.symbol),
			"Historical registry fragment " +
				fragment.id +
				" does not match " +
				fragment.symbol +
				" at " +
				fragment.sourceRevision +
				":" +
				fragment.path +
				":" +
				fragment.line,
		);
	}
	return fragments.length;
}

function expectedModelIds() {
	return [
		{ id: "topology", path: "repository/topology.json" },
		{ id: "artifact-provenance", path: "repository/artifact-provenance.json" },
		{ id: "validation-lanes", path: "repository/validation-lanes.json" },
	];
}

export function validateBaseline(rootDir, controlPlane, baselineOverride) {
	const path = resolve(rootDir, "repository", "control-plane-baseline.json");
	assert(
		existsSync(path),
		"repository/control-plane-baseline.json is required",
	);
	const baseline = baselineOverride ?? JSON.parse(readFileSync(path, "utf8"));
	assert(baseline.version === 1, "control-plane baseline version must be 1");
	assert(
		baseline.before?.sourceRevision === HISTORICAL_REGISTRY_REVISION,
		"baseline must use the immutable historical revision",
	);
	const historicalFragments = baseline.before.registryFragments;
	validateHistoricalRegistryFragments(historicalFragments, {
		sourceReader: (revision, sourcePath) =>
			historicalSource(revision, sourcePath, rootDir),
	});
	assert(
		baseline.before.metrics?.registryFragmentCount ===
			historicalFragments.length,
		"baseline historical registry metric drifted",
	);
	const historicalAggregateIdentities =
		baseline.before.metrics?.aggregateLaneIdentities;
	assert(
		historicalAggregateIdentities &&
			typeof historicalAggregateIdentities === "object",
		"baseline historical aggregate identities are required",
	);
	const historicalAggregateCounts =
		baseline.comparableMetrics?.historicalAggregateLaneCounts;
	assert(
		historicalAggregateCounts && typeof historicalAggregateCounts === "object",
		"baseline historical aggregate counts are required",
	);
	assertIdentityArray(
		Object.keys(historicalAggregateCounts),
		Object.keys(historicalAggregateIdentities),
		"baseline historical aggregate identities",
	);
	assertIdentityArray(
		Object.keys(HISTORICAL_AGGREGATE_IDENTITIES),
		Object.keys(historicalAggregateIdentities),
		"baseline historical aggregate identities",
	);
	for (const [aggregateId, expected] of Object.entries(
		HISTORICAL_AGGREGATE_IDENTITIES,
	))
		assertIdentityArray(
			historicalAggregateIdentities[aggregateId],
			expected,
			"baseline historical aggregate " + aggregateId,
		);
	for (const [aggregateId, identities] of Object.entries(
		historicalAggregateIdentities,
	)) {
		assertArray(identities, "baseline historical aggregate " + aggregateId);
		assert(
			identities.length > 0,
			"baseline historical aggregate " + aggregateId + " must not be empty",
		);
		assert(
			historicalAggregateCounts[aggregateId] === identities.length,
			"baseline historical aggregate count drifted for " + aggregateId,
		);
	}
	const modelIds = expectedModelIds();
	assertIdentityArray(
		baseline.after?.canonicalModels,
		modelIds,
		"baseline canonical model identities",
	);
	assert(
		baseline.after.metrics?.canonicalModelCount === modelIds.length,
		"baseline canonical model count drifted",
	);
	assert(
		baseline.after.metrics.workspaceCount ===
			controlPlane.topology.workspaces.length,
		"baseline workspace count drifted",
	);
	assert(
		baseline.after.metrics.artifactCandidateCount ===
			controlPlane.provenance.candidates.length,
		"baseline artifact candidate count drifted",
	);
	const laneIds = controlPlane.lanes.lanes.map((lane) => lane.id);
	assertIdentityArray(
		baseline.after.validationLaneIdentities,
		laneIds,
		"baseline validation lane identities",
	);
	assert(
		baseline.after.metrics.validationLaneCount === laneIds.length,
		"baseline validation lane count drifted",
	);
	const aggregateIds = Object.keys(controlPlane.lanes.aggregates || {});
	assertIdentityArray(
		Object.keys(baseline.after.metrics.aggregateLaneIdentities || {}).sort(
			(left, right) => left.localeCompare(right),
		),
		[...aggregateIds].sort((left, right) => left.localeCompare(right)),
		"baseline current aggregate identities",
	);
	for (const [aggregateId, aggregate] of Object.entries(
		controlPlane.lanes.aggregates || {},
	)) {
		assertIdentityArray(
			baseline.after.metrics.aggregateLaneIdentities?.[aggregateId],
			aggregate.lanes,
			"baseline aggregate " + aggregateId,
		);
	}
	const comparable = baseline.comparableMetrics;
	assert(
		comparable && typeof comparable === "object",
		"baseline comparable metrics are required",
	);
	assert(
		comparable.historicalAggregateLaneCounts &&
			comparable.currentModeledAggregateLaneCounts,
		"baseline comparable aggregate counts are required",
	);
	assertIdentityArray(
		Object.keys(comparable.currentModeledAggregateLaneCounts).sort(
			(left, right) => left.localeCompare(right),
		),
		[...aggregateIds].sort((left, right) => left.localeCompare(right)),
		"baseline current aggregate counts",
	);
	const laneIdSet = new Set(laneIds);
	for (const [id, count] of Object.entries(
		comparable.currentModeledAggregateLaneCounts,
	)) {
		const flattenedLanes = flattenAggregateLanes(
			controlPlane.lanes.aggregates,
			laneIdSet,
			id,
		);
		assert(
			count === new Set(flattenedLanes).size,
			"baseline current aggregate metric drifted for " + id,
		);
	}
	assert(
		!Object.prototype.hasOwnProperty.call(baseline, "workflowRunCount") &&
			!Object.prototype.hasOwnProperty.call(
				baseline.before,
				"validationExecutionLines",
			),
		"baseline must not use raw workflow execution counts",
	);
	return baseline;
}
