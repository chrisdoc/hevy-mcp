import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadControlPlane, repositoryRoot } from "./control-plane-models.mjs";

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function assertArray(value, label) {
	assert(Array.isArray(value), `${label} must be an array`);
}

function assertUnique(values, label) {
	const duplicates = values.filter(
		(value, index) => values.indexOf(value) !== index,
	);
	assert(
		duplicates.length === 0,
		`${label} contains duplicates: ${[...new Set(duplicates)].join(", ")}`,
	);
}

export const canonicalValidationLaneDispatcher =
	"node scripts/run-validation-lane.mjs";

export const canonicalGeneratorCommands = Object.freeze({
	"build:client":
		"npm run build:client --workspace @hevy-mcp/hevy-client && npx prettier --ignore-unknown --write packages/hevy-client/src/generated",
	"sync:server-manifest": "node scripts/server-manifest.mjs sync",
});

export function validateValidationLaneDispatcher(packageJson) {
	assert(
		packageJson?.scripts?.["validate:lane"] ===
			canonicalValidationLaneDispatcher,
		`validate:lane must delegate exactly to ${canonicalValidationLaneDispatcher}`,
	);
}

export function validateGeneratorCommands(provenance, packageJson) {
	const seen = new Set();
	for (const generator of provenance.generators ?? []) {
		assert(
			typeof generator.command === "string" && generator.command.length > 0,
			`${generator.id}.command is required`,
		);
		assert(
			canonicalGeneratorCommands[generator.command],
			`${generator.id} uses unknown generator command ${generator.command}`,
		);
		assert(
			!seen.has(generator.command),
			`Generator command is duplicated: ${generator.command}`,
		);
		seen.add(generator.command);
		assert(
			packageJson?.scripts?.[generator.command] ===
				canonicalGeneratorCommands[generator.command],
			`${generator.command} script drifted from the canonical generator command`,
		);
	}
}

function packageExports(packageJson) {
	if (!packageJson.exports || typeof packageJson.exports !== "object")
		return [];
	return Object.keys(packageJson.exports);
}

function loadPackageJson(rootDir, workspace) {
	const path = resolve(rootDir, workspace.path, "package.json");
	assert(existsSync(path), `${workspace.path}/package.json is missing`);
	return JSON.parse(readFileSync(path, "utf8"));
}

function checkTopology(rootDir, topology, artifactIds) {
	assert(topology.version === 1, "topology version must be 1");
	assert(
		topology.workspaceGlob === "packages/*",
		"topology workspaceGlob must be packages/*",
	);
	assert(
		topology.root?.private === true && topology.root?.orchestrator === true,
		"topology root must describe a private orchestrator",
	);
	assertArray(topology.workspaces, "topology.workspaces");
	assertUnique(
		topology.workspaces.map((workspace) => workspace.id),
		"workspace ids",
	);
	assertUnique(
		topology.workspaces.map((workspace) => workspace.path),
		"workspace paths",
	);
	assertUnique(
		topology.workspaces.map((workspace) => workspace.name),
		"workspace names",
	);
	const ids = new Set(topology.workspaces.map((workspace) => workspace.id));
	const names = new Set(topology.workspaces.map((workspace) => workspace.name));
	for (const workspace of topology.workspaces) {
		for (const field of ["id", "path", "name", "runtime"])
			assert(
				typeof workspace[field] === "string" && workspace[field],
				`workspace ${workspace.id ?? "?"} needs ${field}`,
			);
		assert(
			typeof workspace.private === "boolean",
			`${workspace.id} private must be boolean`,
		);
		assert(
			typeof workspace.publishable === "boolean",
			`${workspace.id} publishable must be boolean`,
		);
		assert(
			workspace.publishable === !workspace.private,
			`${workspace.id} publishability must match private ownership`,
		);
		assertArray(workspace.exports, `${workspace.id}.exports`);
		assertArray(workspace.dependencies, `${workspace.id}.dependencies`);
		for (const dependency of workspace.dependencies)
			assert(
				ids.has(dependency),
				`${workspace.id} references unknown dependency ${dependency}`,
			);
		assert(
			workspace.boundary && typeof workspace.boundary === "object",
			`${workspace.id}.boundary is required`,
		);
		assert(
			workspace.boundary.allowed &&
				typeof workspace.boundary.allowed === "object",
			`${workspace.id}.boundary.allowed is required`,
		);
		for (const packageName of Object.keys(workspace.boundary.allowed))
			assert(
				names.has(packageName),
				`${workspace.id}.boundary.allowed references unknown package ${packageName}`,
			);
		for (const artifact of workspace.artifacts ?? [])
			assert(
				artifactIds.has(artifact),
				`${workspace.id} references unknown artifact ${artifact}`,
			);
		const packageJson = loadPackageJson(rootDir, workspace);
		assert(
			packageJson.name === workspace.name,
			`${workspace.path}/package.json name does not match topology`,
		);
		assert(
			(packageJson.private === true) === workspace.private,
			`${workspace.path}/package.json private flag does not match topology`,
		);
		assert(
			JSON.stringify(packageExports(packageJson)) ===
				JSON.stringify(workspace.exports),
			`${workspace.path}/package.json exports do not match topology`,
		);
	}
	const actualPaths = readdirSync(resolve(rootDir, "packages"), {
		withFileTypes: true,
	})
		.filter((entry) => entry.isDirectory())
		.map((entry) => `packages/${entry.name}`)
		.sort();
	const expectedPaths = topology.workspaces
		.map((workspace) => workspace.path)
		.sort();
	assert(
		JSON.stringify(actualPaths) === JSON.stringify(expectedPaths),
		`workspace directories do not match topology: expected ${expectedPaths.join(
			", ",
		)}; found ${actualPaths.join(", ")}`,
	);
	const release = topology.release;
	assert(
		release && typeof release === "object",
		"topology.release is required",
	);
	assertArray(release.triggers, "topology.release.triggers");
	for (const trigger of release.triggers)
		assert(
			ids.has(trigger.workspace),
			`release trigger ${trigger.path} references unknown workspace ${trigger.workspace}`,
		);
	assertArray(release.bundles, "topology.release.bundles");
	for (const bundle of release.bundles) {
		assert(
			ids.has(bundle.workspace),
			`release bundle references unknown workspace ${bundle.workspace}`,
		);
		assertArray(
			bundle.consumers,
			`release bundle ${bundle.workspace}.consumers`,
		);
		for (const consumer of bundle.consumers)
			assert(
				ids.has(consumer),
				`release bundle ${bundle.workspace} references unknown consumer ${consumer}`,
			);
	}
}

function checkProvenance(
	provenance,
	topology,
	laneIds,
	rootDir = repositoryRoot,
) {
	assert(provenance.version === 1, "artifact provenance version must be 1");
	for (const field of ["sources", "generators", "outputs", "candidates"])
		assertArray(provenance[field], `artifact provenance ${field}`);
	const allIds = [
		...provenance.sources,
		...provenance.generators,
		...provenance.outputs,
		...provenance.candidates,
	].map((entry) => entry.id);
	assertUnique(allIds, "artifact provenance ids");
	const sourceIds = new Set(provenance.sources.map((entry) => entry.id));
	const outputIds = new Set(provenance.outputs.map((entry) => entry.id));
	const candidateIds = new Set(provenance.candidates.map((entry) => entry.id));
	const workspaceIds = new Set(
		topology.workspaces.map((workspace) => workspace.id),
	);
	for (const source of provenance.sources) {
		assertArray(source.paths, `${source.id}.paths`);
		assert(source.paths.length > 0, `${source.id}.paths must not be empty`);
		assert(typeof source.kind === "string", `${source.id}.kind is required`);
	}
	for (const generator of provenance.generators) {
		assertArray(generator.inputs, `${generator.id}.inputs`);
		assertArray(generator.outputs, `${generator.id}.outputs`);
		assertArray(generator.validation, `${generator.id}.validation`);
		for (const input of generator.inputs)
			assert(
				sourceIds.has(input),
				`${generator.id} references unknown source ${input}`,
			);
		for (const output of generator.outputs)
			assert(
				outputIds.has(output),
				`${generator.id} references unknown output ${output}`,
			);
		for (const lane of generator.validation)
			assert(
				laneIds.has(lane),
				`${generator.id} references unknown lane ${lane}`,
			);
	}
	const packageJson = JSON.parse(
		readFileSync(resolve(rootDir, "package.json"), "utf8"),
	);
	validateGeneratorCommands(provenance, packageJson);
	for (const output of provenance.outputs) {
		assertArray(output.paths, `${output.id}.paths`);
		assert(output.paths.length > 0, `${output.id}.paths must not be empty`);
		assert(typeof output.kind === "string", `${output.id}.kind is required`);
		for (const lane of output.owners ?? [])
			assert(
				laneIds.has(lane),
				`${output.id} references unknown validation owner ${lane}`,
			);
	}
	for (const candidate of provenance.candidates) {
		assert(
			typeof candidate.workspace === "string" &&
				workspaceIds.has(candidate.workspace),
			`${candidate.id} references unknown workspace`,
		);
		assertArray(candidate.sourcePaths, `${candidate.id}.sourcePaths`);
		assertArray(candidate.validation, `${candidate.id}.validation`);
		for (const lane of candidate.validation)
			assert(
				laneIds.has(lane),
				`${candidate.id} references unknown lane ${lane}`,
			);
	}
	assert(!candidateIds.has(""), "artifact candidate ids must be non-empty");
}

const selectorKinds = new Set([
	"vitest",
	"vitest-worker-config",
	"npm-pack-smoke",
	"workspace-test",
	"control-plane",
	"changeset-status",
	"typescript",
	"repository-check",
	"package-build",
	"wrangler-dry-run",
	"manifest-drift",
	"vitest-live",
	"worker-live",
	"vitest-integration",
	"launcher-canary",
	"docker-smoke",
	"generated-output-closure",
]);

const selectorCheckScripts = {
	topology: "scripts/check-workspaces.mjs",
	boundaries: "scripts/check-package-boundaries.mjs",
	exports: "scripts/check-package-exports.mjs",
	"release-candidates": "scripts/check-release-candidates.mjs",
	changesets: "scripts/check-package-changesets.mjs",
};

function commandInvocations(command, laneId) {
	assert(
		command && ["argv", "sequence"].includes(command.kind),
		`${laneId} needs an argv or sequence command`,
	);
	const invocations = command.kind === "argv" ? [command] : command.commands;
	assert(
		Array.isArray(invocations) && invocations.length > 0,
		`${laneId} command must contain at least one invocation`,
	);
	for (const invocation of invocations) {
		assert(
			typeof invocation.executable === "string" &&
				invocation.executable.length > 0,
			`${laneId} command executable is required`,
		);
		assert(
			Array.isArray(invocation.args) &&
				invocation.args.every((arg) => typeof arg === "string"),
			`${laneId} command args must be strings`,
		);
		assert(
			![invocation.executable, ...invocation.args].some((arg) =>
				arg.includes("run-validation-lane.mjs"),
			),
			`${laneId} command must not recurse through the lane dispatcher`,
		);
	}
	return invocations;
}

function hasExactPair(tokens, flag, value) {
	for (let index = 0; index < tokens.length - 1; index += 1)
		if (tokens[index] === flag && tokens[index + 1] === value) return true;
	return false;
}

function hasWorkspace(tokens, workspace) {
	return (
		tokens.includes(`--workspace=${workspace}`) ||
		hasExactPair(tokens, "--workspace", workspace)
	);
}

function hasSelectorPath(tokens, path) {
	return (
		tokens.includes(path) ||
		(path.endsWith("/**") && tokens.includes(path.slice(0, -3)))
	);
}

function validateSelector(lane, command) {
	const selector = lane.selector;
	assert(
		selector && typeof selector === "object",
		`${lane.id}.selector is required`,
	);
	assert(
		selectorKinds.has(selector.kind),
		`${lane.id} has unknown selector kind ${selector.kind}`,
	);
	const invocations = commandInvocations(command, lane.id);
	const tokens = invocations.flatMap(({ executable, args }) => [
		executable,
		...args,
	]);
	const executable = invocations[0].executable;
	const executables = invocations.map(({ executable: value }) => value);
	const expectedExecutables = {
		vitest: "vitest",
		"vitest-worker-config": "vitest",
		"npm-pack-smoke": "node",
		"workspace-test": "npm",
		"control-plane": "node",
		"changeset-status": "changeset",
		typescript: "tsc",
		"repository-check": "node",
		"package-build": "npm",
		"wrangler-dry-run": "wrangler",
		"manifest-drift": "node",
		"vitest-live": "node",
		"worker-live": "node",
		"vitest-integration": "node",
		"launcher-canary": "node",
	};
	if (expectedExecutables[selector.kind])
		assert(
			executables.includes(expectedExecutables[selector.kind]),
			`${lane.id} selector kind ${selector.kind} requires ${
				expectedExecutables[selector.kind]
			}, found ${executable}`,
		);
	for (const field of ["include", "exclude"]) {
		for (const path of selector[field] ?? [])
			assert(
				field === "exclude"
					? hasExactPair(tokens, "--exclude", path)
					: hasSelectorPath(tokens, path),
				`${lane.id} selector ${field} ${path} is not an exact command argument`,
			);
	}
	if (selector.config)
		assert(
			hasExactPair(tokens, "--config", selector.config),
			`${lane.id} selector config ${selector.config} is not an exact command argument`,
		);
	if (selector.workspace)
		assert(
			hasWorkspace(tokens, selector.workspace),
			`${lane.id} selector workspace ${selector.workspace} is not an exact command argument`,
		);
	if (selector.check) {
		const script = selectorCheckScripts[selector.check];
		assert(
			script,
			`${lane.id} has unknown control-plane check ${selector.check}`,
		);
		assert(
			tokens.includes(script),
			`${lane.id} selector check ${selector.check} is not an exact command path`,
		);
	}
	if (selector.project)
		assert(
			selector.project === "tsconfig.json" && executables.includes("tsc"),
			`${lane.id} selector project ${selector.project} is not an exact command target`,
		);
	const exactTargets = {
		"npm-pack-smoke": selector.workspace
			? "packages/cli/tests/npm-pack-smoke.mjs"
			: "tests/package/npm-pack-smoke.mjs",
		"vitest-live": "scripts/run-live-tests.mjs",
		"worker-live": "scripts/run-live-worker-http-tests.mjs",
		"vitest-integration": "node_modules/vitest/vitest.mjs",
		"launcher-canary": "tests/nightly/test_hevy_mcp.mjs",
	};
	if (exactTargets[selector.kind])
		assert(
			tokens.includes(exactTargets[selector.kind]),
			`${lane.id} selector kind ${selector.kind} is missing exact target ${
				exactTargets[selector.kind]
			}`,
		);
}

export function validateAggregateAcyclicity(aggregates) {
	const visiting = new Set();
	const visited = new Set();
	const visit = (id, stack = []) => {
		if (visiting.has(id))
			throw new Error(
				`Validation aggregate cycle: ${[...stack, id].join(" -> ")}`,
			);
		if (visited.has(id)) return;
		const aggregate = aggregates[id];
		if (!aggregate) return;
		visiting.add(id);
		for (const member of aggregate.lanes ?? [])
			if (aggregates[member]) visit(member, [...stack, id]);
		visiting.delete(id);
		visited.add(id);
	};
	for (const id of Object.keys(aggregates ?? {})) visit(id);
}

function checkLanes(lanes, topology, provenance, rootDir = repositoryRoot) {
	assert(lanes.version === 1, "validation lane manifest version must be 1");
	assert(
		lanes.runtimeMatrix && typeof lanes.runtimeMatrix === "object",
		"validation runtimeMatrix is required",
	);
	assertArray(lanes.lanes, "validation lanes");
	assertUnique(
		lanes.lanes.map((lane) => lane.id),
		"validation lane ids",
	);
	const laneIds = new Set(lanes.lanes.map((lane) => lane.id));
	const aliases = new Set();
	const packageJson = JSON.parse(
		readFileSync(resolve(rootDir, "package.json"), "utf8"),
	);
	validateValidationLaneDispatcher(packageJson);
	for (const lane of lanes.lanes) {
		for (const field of [
			"id",
			"selector",
			"runtimes",
			"credentials",
			"artifacts",
			"gate",
			"comparison",
			"changeImpact",
		])
			assert(
				lane[field] !== undefined,
				`validation lane ${lane.id ?? "?"} needs ${field}`,
			);
		for (const runtime of lane.runtimes)
			assert(
				lanes.runtimeMatrix[runtime],
				`${lane.id} references unknown runtime ${runtime}`,
			);
		for (const artifact of lane.artifacts) {
			const known = [...provenance.outputs, ...provenance.candidates].some(
				(entry) => entry.id === artifact,
			);
			assert(known, `${lane.id} references unknown artifact ${artifact}`);
		}
		assert(
			lane.credentials.every((credential) =>
				/^[A-Z][A-Z0-9_]+$/.test(credential),
			),
			`${lane.id} credentials must be environment variable names`,
		);
		assert(lane.gate !== "secret", `${lane.id} cannot encode secret values`);
		if (lane.external) {
			assert(
				typeof lane.integration === "string" && lane.integration.length > 0,
				`${lane.id} external lanes need integration ownership`,
			);
			assert(
				lane.alias === undefined && lane.command === undefined,
				`${lane.id} external lanes must not advertise npm aliases`,
			);
			continue;
		}
		assert(
			typeof lane.alias === "string" && lane.alias.length > 0,
			`${lane.id} needs a public command alias`,
		);
		assert(
			!aliases.has(lane.alias),
			`validation lane alias is duplicated: ${lane.alias}`,
		);
		aliases.add(lane.alias);
		const script = packageJson.scripts[lane.alias];
		assert(
			typeof script === "string",
			`${lane.id} alias ${lane.alias} is not a root command`,
		);
		assert(
			script === `node scripts/run-validation-lane.mjs --execute ${lane.id}`,
			`${lane.id} alias ${lane.alias} must delegate exactly to its lane id`,
		);
		validateSelector(lane, lane.command);
	}
	const aggregates = lanes.aggregates ?? {};
	validateAggregateAcyclicity(aggregates);
	for (const [aggregateId, aggregate] of Object.entries(aggregates)) {
		assertArray(aggregate.lanes, `aggregate ${aggregateId}.lanes`);
		for (const member of aggregate.lanes)
			assert(
				laneIds.has(member) || aggregates[member],
				`${aggregateId} references unknown lane or aggregate ${member}`,
			);
		if (aggregate.alias !== undefined)
			assert(
				typeof aggregate.alias === "string" &&
					typeof packageJson.scripts[aggregate.alias] === "string",
				`${aggregateId} alias ${aggregate.alias} is not a root command`,
			);
		if (aggregate.alias !== undefined) {
			assert(
				packageJson.scripts[aggregate.alias] ===
					`node scripts/run-validation-lane.mjs ${aggregateId}`,
				`${aggregateId} alias ${aggregate.alias} must delegate exactly to its aggregate id`,
			);
			assert(
				!aliases.has(aggregate.alias),
				`validation alias is duplicated: ${aggregate.alias}`,
			);
			aliases.add(aggregate.alias);
		}
	}
	for (const route of lanes.changeImpactRouting ?? []) {
		assert(
			typeof route.pattern === "string",
			"change-impact route pattern must be a string",
		);
		assertArray(route.lanes, `change-impact route ${route.pattern}.lanes`);
		for (const lane of route.lanes)
			assert(
				laneIds.has(lane),
				`change-impact route references unknown lane ${lane}`,
			);
	}
	const workspaceIds = new Set(
		topology.workspaces.map((workspace) => workspace.id),
	);
	for (const lane of lanes.lanes) {
		const workspace = lane.selector?.workspace;
		if (workspace)
			assert(
				workspaceIds.has(workspace) ||
					topology.workspaces.some((entry) => entry.name === workspace),
				`${lane.id} selector references unknown workspace ${workspace}`,
			);
	}
	for (const [workflow, projection] of Object.entries(
		lanes.workflowProjections ?? {},
	)) {
		assertArray(projection, `workflow projection ${workflow}`);
		for (const entry of projection) {
			assert(
				laneIds.has(entry.lane),
				`workflow projection ${workflow} references unknown lane ${entry.lane}`,
			);
			assert(
				typeof entry.job === "string" && entry.job.length > 0,
				`workflow projection ${workflow}.${entry.lane}.job is required`,
			);
			assertArray(
				entry.runtimes,
				`workflow projection ${workflow}.${entry.lane}.runtimes`,
			);
			for (const field of ["condition", "jobCondition", "stepCondition"])
				assert(
					entry[field] === null || typeof entry[field] === "string",
					`workflow projection ${workflow}.${entry.lane}.${field} must be null or a string`,
				);
			for (const runtime of entry.runtimes)
				assert(
					lanes.runtimeMatrix[runtime],
					`workflow projection ${workflow}.${entry.lane} runtime ${runtime} is not in the runtime matrix`,
				);
		}
	}
}

export function validateControlPlane(rootDir = repositoryRoot) {
	const controlPlane = loadControlPlane(rootDir);
	const artifactIds = new Set([
		...controlPlane.provenance.outputs.map((entry) => entry.id),
		...controlPlane.provenance.candidates.map((entry) => entry.id),
	]);
	const laneIds = new Set(controlPlane.lanes.lanes.map((lane) => lane.id));
	checkTopology(rootDir, controlPlane.topology, artifactIds);
	checkProvenance(
		controlPlane.provenance,
		controlPlane.topology,
		laneIds,
		rootDir,
	);
	checkLanes(
		controlPlane.lanes,
		controlPlane.topology,
		controlPlane.provenance,
		rootDir,
	);
	return controlPlane;
}
