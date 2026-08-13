import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadControlPlane, repositoryRoot } from "./control-plane-models.mjs";
import {
	isBoolean,
	isObjectLike,
	isString,
} from "./runtime-value-predicates.mjs";

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
	"node-test",
]);
const gateKinds = new Set([
	"blocking",
	"informational",
	"advisory",
	"release",
	"nightly",
]);
const mappingStatuses = new Set(["mapped", "external", "unresolved"]);
const allowedRuntimes = new Set(["neutral", "node", "workerd"]);
const allowedRoles = new Set(["client", "runtime", "server", "adapter", "cli"]);

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function assertArray(value, label) {
	assert(Array.isArray(value), label + " must be an array");
}

function assertString(value, label) {
	assert(isString(value) && value.length > 0, label + " is required");
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

function packageExports(packageJson) {
	if (!packageJson.exports || !isObjectLike(packageJson.exports)) return [];
	return Object.keys(packageJson.exports);
}

function loadPackageJson(rootDir, workspace) {
	const packagePath = resolve(rootDir, workspace.path, "package.json");
	assert(existsSync(packagePath), workspace.path + "/package.json is missing");
	return JSON.parse(readFileSync(packagePath, "utf8"));
}

function internalDependencyIds(packageJson, names) {
	const fields = [
		...(packageJson.dependencies ? Object.keys(packageJson.dependencies) : []),
		...(packageJson.devDependencies
			? Object.keys(packageJson.devDependencies)
			: []),
	];
	return [
		...new Set(
			fields.filter((name) => names.has(name)).map((name) => names.get(name)),
		),
	].sort((left, right) => left.localeCompare(right));
}

function validateReleaseGraph(topology) {
	const bundles = topology.release.bundles;
	assertUnique(
		bundles.map((bundle) => bundle.workspace),
		"release bundle workspaces",
	);
	const bundleIds = new Set(bundles.map((bundle) => bundle.workspace));
	const graph = new Map(
		bundles.map((bundle) => [bundle.workspace, bundle.consumers]),
	);
	const visiting = new Set();
	const visited = new Set();
	const visit = (id, stack) => {
		if (visiting.has(id))
			throw new Error("Release cascade cycle: " + [...stack, id].join(" -> "));
		if (visited.has(id)) return;
		visiting.add(id);
		for (const consumer of graph.get(id) || []) visit(consumer, [...stack, id]);
		visiting.delete(id);
		visited.add(id);
	};
	for (const id of bundleIds) visit(id, []);
}

export function validateTopology(rootDir, topology, artifactIds) {
	assert(topology && topology.version === 1, "topology version must be 1");
	assertString(topology.workspaceGlob, "topology.workspaceGlob");
	assert(
		topology.root?.private === true && topology.root?.orchestrator === true,
		"topology root must describe a private orchestrator",
	);
	const rootPackagePath = resolve(rootDir, "package.json");
	assert(existsSync(rootPackagePath), "root package.json is required");
	const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8"));
	assertArray(rootPackage.workspaces, "root package workspaces");
	assert(
		JSON.stringify(rootPackage.workspaces) ===
			JSON.stringify([topology.workspaceGlob]),
		"root package workspaces must match topology workspaceGlob",
	);
	assert(
		rootPackage.private === topology.root.private,
		"root package private flag does not match topology",
	);
	assert(
		rootPackage.private === true,
		"Root orchestration package must be private",
	);
	for (const field of [
		"version",
		"main",
		"module",
		"types",
		"bin",
		"files",
		"publishConfig",
	])
		assert(
			!(field in rootPackage),
			"Root orchestration package must not declare " + field,
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
	const names = new Map(
		topology.workspaces.map((workspace) => [workspace.name, workspace.id]),
	);
	for (const workspace of topology.workspaces) {
		for (const field of ["id", "path", "name", "runtime", "role"])
			assertString(
				workspace[field],
				"workspace " + (workspace.id || "?") + "." + field,
			);
		assert(
			allowedRuntimes.has(workspace.runtime),
			workspace.id + " has unknown runtime",
		);
		assert(
			allowedRoles.has(workspace.role),
			workspace.id + " has unknown role",
		);
		assert(
			isBoolean(workspace.private),
			workspace.id + " private must be boolean",
		);
		assert(
			isBoolean(workspace.publishable),
			workspace.id + " publishable must be boolean",
		);
		assert(
			!workspace.publishable || !workspace.private,
			workspace.id + " publishable workspaces must be non-private",
		);
		assertArray(workspace.exports, workspace.id + ".exports");
		assertArray(workspace.dependencies, workspace.id + ".dependencies");
		assertArray(workspace.artifacts, workspace.id + ".artifacts");
		assertUnique(workspace.dependencies, workspace.id + " dependencies");
		assertUnique(workspace.artifacts, workspace.id + " artifacts");
		for (const dependency of workspace.dependencies)
			assert(
				ids.has(dependency),
				workspace.id + " references unknown dependency " + dependency,
			);
		assert(
			workspace.boundary && isObjectLike(workspace.boundary),
			workspace.id + ".boundary is required",
		);
		assertArray(
			workspace.boundary.forbidden,
			workspace.id + ".boundary.forbidden",
		);
		for (const pattern of workspace.boundary.forbidden)
			assertString(pattern, workspace.id + ".boundary.forbidden pattern");
		assert(
			isBoolean(workspace.boundary.rejectBuiltins),
			workspace.id + ".boundary.rejectBuiltins must be boolean",
		);
		assert(
			isBoolean(workspace.boundary.rejectDynamicImports),
			workspace.id + ".boundary.rejectDynamicImports must be boolean",
		);
		assert(
			workspace.boundary.allowed && isObjectLike(workspace.boundary.allowed),
			workspace.id + ".boundary.allowed is required",
		);
		for (const packageName of Object.keys(workspace.boundary.allowed)) {
			const subpaths = workspace.boundary.allowed[packageName];
			assert(
				names.has(packageName),
				workspace.id +
					".boundary.allowed references unknown package " +
					packageName,
			);
			assert(
				names.get(packageName) &&
					workspace.dependencies.includes(names.get(packageName)),
				workspace.id + ".boundary.allowed package is not a declared dependency",
			);
			assertArray(subpaths, workspace.id + ".boundary.allowed." + packageName);
			for (const subpath of subpaths)
				assert(
					isString(subpath),
					workspace.id + ".boundary.allowed subpaths must be strings",
				);
		}
		for (const artifact of workspace.artifacts)
			assert(
				artifactIds.has(artifact),
				workspace.id + " references unknown artifact " + artifact,
			);
		const packageJson = loadPackageJson(rootDir, workspace);
		assert(
			packageJson.name === workspace.name,
			workspace.path + "/package.json name does not match topology",
		);
		assert(
			(packageJson.private === true) === workspace.private,
			workspace.path + "/package.json private flag does not match topology",
		);
		assert(
			workspace.publishable === (packageJson.private !== true),
			workspace.path + "/package.json publishability does not match topology",
		);
		assert(
			JSON.stringify(packageExports(packageJson)) ===
				JSON.stringify(workspace.exports),
			workspace.path + "/package.json exports do not match topology",
		);
		assert(
			JSON.stringify(internalDependencyIds(packageJson, names)) ===
				JSON.stringify(
					[...workspace.dependencies].sort((left, right) =>
						left.localeCompare(right),
					),
				),
			workspace.path +
				"/package.json dependency direction does not match topology",
		);
	}
	const actualPaths = readdirSync(resolve(rootDir, "packages"), {
		withFileTypes: true,
	})
		.filter((entry) => entry.isDirectory())
		.map((entry) => "packages/" + entry.name)
		.sort();
	const expectedPaths = topology.workspaces
		.map((workspace) => workspace.path)
		.sort();
	assert(
		JSON.stringify(actualPaths) === JSON.stringify(expectedPaths),
		"workspace directories do not match topology",
	);
	const publishablePackages = topology.workspaces
		.filter((workspace) => workspace.publishable)
		.map((workspace) => workspace.name)
		.sort((left, right) => left.localeCompare(right));
	const nonPrivatePackages = topology.workspaces
		.filter((workspace) => workspace.private !== true)
		.map((workspace) => workspace.name)
		.sort((left, right) => left.localeCompare(right));
	assert(
		JSON.stringify(publishablePackages) === JSON.stringify(nonPrivatePackages),
		"every non-private workspace must be declared publishable",
	);
	const release = topology.release;
	assert(release && isObjectLike(release), "topology.release is required");
	assertArray(release.triggers, "topology.release.triggers");
	assertUnique(
		release.triggers.map((trigger) => trigger?.path),
		"release trigger paths",
	);
	for (const trigger of release.triggers) {
		assertString(trigger.path, "release trigger path");
		assert(
			ids.has(trigger.workspace),
			"release trigger references unknown workspace " + trigger.workspace,
		);
	}
	assertArray(release.bundles, "topology.release.bundles");
	for (const bundle of release.bundles) {
		assert(
			ids.has(bundle.workspace),
			"release bundle references unknown workspace " + bundle.workspace,
		);
		assertArray(bundle.consumers, "release bundle consumers");
		for (const consumer of bundle.consumers)
			assert(
				ids.has(consumer),
				"release bundle references unknown consumer " + consumer,
			);
	}
	validateReleaseGraph(topology);
	return topology;
}

export function validateArtifactProvenance(
	provenance,
	topology,
	laneIds,
	rootDir = repositoryRoot,
) {
	assert(
		provenance && provenance.version === 1,
		"artifact provenance version must be 1",
	);
	for (const field of ["sources", "generators", "outputs", "candidates"])
		assertArray(provenance[field], "artifact provenance " + field);
	const allEntries = [
		...provenance.sources,
		...provenance.generators,
		...provenance.outputs,
		...provenance.candidates,
	];
	assertUnique(
		allEntries.map((entry) => entry.id),
		"artifact provenance ids",
	);
	for (const entry of allEntries)
		assert(
			!("command" in entry) && !("credentials" in entry),
			"artifact provenance entries must not encode commands or credentials",
		);
	const sourceIds = new Set(provenance.sources.map((entry) => entry.id));
	const outputIds = new Set(provenance.outputs.map((entry) => entry.id));
	const workspaceIds = new Set(
		topology.workspaces.map((workspace) => workspace.id),
	);
	const project = JSON.parse(
		readFileSync(resolve(rootDir, "project.json"), "utf8"),
	);
	const packageJson = JSON.parse(
		readFileSync(resolve(rootDir, "package.json"), "utf8"),
	);
	const projectTargets = project.targets || {};
	const targetIds = new Set([
		...Object.keys(projectTargets),
		...Object.keys(packageJson.scripts || {}),
	]);
	const validationTargetIds = new Set([...targetIds, ...laneIds]);
	const assertTarget = (target, label) => {
		assertString(target, label);
		assert(
			validationTargetIds.has(target),
			label + " references missing producer or validation target " + target,
		);
	};
	const assertProducer = (producer, label) => {
		assert(producer && isObjectLike(producer), label + " producer is required");
		assertString(producer.kind, label + ".producer.kind");
		assert(
			!("command" in producer) && !("credentials" in producer),
			label + " producer must not encode commands or credentials",
		);
		if (producer.kind === "nx-target") {
			assertTarget(producer.target, label + ".producer.target");
			return;
		}
		assert(
			producer.kind === "external" &&
				isString(producer.id) &&
				producer.id.length > 0,
			label + ".producer must be an Nx target or named external producer",
		);
	};
	const targetOutputPaths = (target) =>
		(projectTargets[target]?.outputs || []).map((output) =>
			String(output)
				.replaceAll("{workspaceRoot}/", "")
				.replaceAll("{projectRoot}/", ""),
		);
	const outputPathMatches = (path, targetOutput) => {
		const normalizedPath = path.replaceAll("\\", "/");
		const normalizedOutput = targetOutput
			.replaceAll("\\", "/")
			.replace(/\/\*\*$/, "")
			.replace(/\/\*$/, "");
		if (
			normalizedPath === normalizedOutput ||
			normalizedPath.startsWith(normalizedOutput + "/")
		)
			return true;
		let pattern = "^";
		for (let index = 0; index < normalizedOutput.length; index++) {
			if (normalizedOutput.startsWith("**", index)) {
				pattern += ".*";
				index++;
				continue;
			}
			if (normalizedOutput[index] === "*") {
				pattern += "[^/]*";
				continue;
			}
			pattern += normalizedOutput[index].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
		return new RegExp(pattern + "$").test(normalizedPath);
	};
	for (const source of provenance.sources) {
		assertString(source.id, "artifact source id");
		assertArray(source.paths, source.id + ".paths");
		assert(source.paths.length > 0, source.id + ".paths must not be empty");
		assertString(source.kind, source.id + ".kind");
	}
	for (const generator of provenance.generators) {
		assertString(generator.id, "artifact generator id");
		assertString(generator.kind, generator.id + ".kind");
		assert(
			!("command" in generator),
			generator.id + " must not encode commands",
		);
		assertArray(generator.inputs, generator.id + ".inputs");
		assertArray(generator.outputs, generator.id + ".outputs");
		assertArray(generator.validation, generator.id + ".validation");
		assertProducer(generator.producer, generator.id);
		assertArray(
			generator.validationTargets,
			generator.id + ".validationTargets",
		);
		assert(
			generator.validationTargets.length > 0,
			generator.id + ".validationTargets must not be empty",
		);
		for (const target of generator.validationTargets)
			assertTarget(target, generator.id + ".validationTargets");
		for (const input of generator.inputs)
			assert(
				sourceIds.has(input),
				generator.id + " references unknown source " + input,
			);
		for (const output of generator.outputs)
			assert(
				outputIds.has(output),
				generator.id + " references unknown output " + output,
			);
		for (const lane of generator.validation)
			assert(
				laneIds.has(lane),
				generator.id + " references unknown lane " + lane,
			);
	}
	for (const output of provenance.outputs) {
		assertString(output.id, "artifact output id");
		assertArray(output.paths, output.id + ".paths");
		assertString(output.kind, output.id + ".kind");
		if (output.kind !== "external")
			assert(output.paths.length > 0, output.id + ".paths must not be empty");
		assertArray(output.owners, output.id + ".owners");
		assert(output.owners.length > 0, output.id + ".owners must not be empty");
		assertArray(output.producers, output.id + ".producers");
		assert(
			output.producers.length > 0,
			output.id + ".producers must not be empty",
		);
		for (const producer of output.producers)
			assertProducer(producer, output.id);
		assertArray(output.validationTargets, output.id + ".validationTargets");
		assert(
			output.validationTargets.length > 0,
			output.id + ".validationTargets must not be empty",
		);
		for (const target of output.validationTargets)
			assertTarget(target, output.id + ".validationTargets");
		if (output.kind !== "external") {
			for (const producer of output.producers) {
				if (producer.kind !== "nx-target") continue;
				const outputs = targetOutputPaths(producer.target);
				if (outputs.length === 0) continue;
				for (const path of output.paths)
					assert(
						outputs.some((targetOutput) =>
							outputPathMatches(path, targetOutput),
						),
						output.id +
							" path " +
							path +
							" does not match producer target output " +
							producer.target,
					);
			}
		} else {
			assert(
				output.paths.length === 0 &&
					output.producers.every((producer) => producer.kind === "external"),
				output.id + " external output needs an external producer and no paths",
			);
		}
		for (const owner of output.owners)
			assert(
				laneIds.has(owner),
				output.id + " references unknown owner " + owner,
			);
	}
	for (const candidate of provenance.candidates) {
		assertString(candidate.id, "artifact candidate id");
		assertString(candidate.kind, candidate.id + ".kind");
		assert(
			!("command" in candidate) && !("credentials" in candidate),
			candidate.id + " must not encode commands or credentials",
		);
		assert(
			isString(candidate.workspace) && workspaceIds.has(candidate.workspace),
			candidate.id + " references unknown workspace",
		);
		assertArray(candidate.sourcePaths, candidate.id + ".sourcePaths");
		assert(
			candidate.sourcePaths.length > 0,
			candidate.id + ".sourcePaths must not be empty",
		);
		assertArray(candidate.outputs, candidate.id + ".outputs");
		assert(
			candidate.outputs.length > 0,
			candidate.id + ".outputs must not be empty",
		);
		for (const output of candidate.outputs)
			assert(
				outputIds.has(output),
				candidate.id + " references unknown output " + output,
			);
		assertArray(candidate.producers, candidate.id + ".producers");
		assert(
			candidate.producers.length > 0,
			candidate.id + ".producers must not be empty",
		);
		for (const producer of candidate.producers)
			assertProducer(producer, candidate.id);
		assertArray(
			candidate.validationTargets,
			candidate.id + ".validationTargets",
		);
		assert(
			candidate.validationTargets.length > 0,
			candidate.id + ".validationTargets must not be empty",
		);
		for (const target of candidate.validationTargets)
			assertTarget(target, candidate.id + ".validationTargets");
		if (candidate.external === true)
			assert(
				candidate.producers.every((producer) => producer.kind === "external"),
				candidate.id + " external candidate needs an external producer",
			);
		else
			assert(
				candidate.producers.every((producer) => producer.kind === "nx-target"),
				candidate.id + " non-external candidate needs Nx producers",
			);
		assertArray(candidate.validation, candidate.id + ".validation");
		for (const lane of candidate.validation)
			assert(
				laneIds.has(lane),
				candidate.id + " references unknown lane " + lane,
			);
	}
	const requiredCandidateSources = {
		"worker-bundle": [
			"packages/worker/**",
			"packages/core/**",
			"packages/hevy-client/**",
			"cloudflare.config.ts",
			"package.json",
			"package-lock.json",
			"packages/worker/package.json",
			"packages/core/package.json",
			"packages/hevy-client/package.json",
		],
		"docker-image": [
			"Dockerfile",
			"package.json",
			"package-lock.json",
			"tsconfig.base.json",
			"tsconfig.json",
			"packages/hevy-client/package.json",
			"packages/core/package.json",
			"packages/node/package.json",
			"packages/worker/package.json",
			"packages/hevy-client/**",
			"packages/core/**",
			"packages/node/**",
		],
	};
	for (const [candidateId, requiredPaths] of Object.entries(
		requiredCandidateSources,
	)) {
		const candidate = provenance.candidates.find(
			(entry) => entry.id === candidateId,
		);
		assert(candidate, "required artifact candidate missing: " + candidateId);
		for (const sourcePath of requiredPaths)
			assert(
				candidate.sourcePaths.includes(sourcePath),
				candidateId + " source coverage is missing " + sourcePath,
			);
	}
	const requiredCandidates = new Set([
		"node-package",
		"cli-package",
		"worker-bundle",
		"docker-image",
	]);
	for (const candidate of requiredCandidates)
		assert(
			provenance.candidates.some((entry) => entry.id === candidate),
			"required artifact candidate missing: " + candidate,
		);
	for (const required of [
		"generated-client",
		"server-manifest",
		"plugin-manifest",
		"node-dist",
		"node-package-tarball",
		"cli-dist",
		"cli-package-tarball",
		"worker-dry-run",
		"docker-image-output",
	])
		assert(
			provenance.outputs.some((entry) => entry.id === required),
			"required artifact output missing: " + required,
		);
	return provenance;
}

function validateSelector(lane) {
	const selector = lane.selector;
	assert(selector && isObjectLike(selector), lane.id + ".selector is required");
	assert(
		selectorKinds.has(selector.kind),
		lane.id + " has unknown selector kind " + selector.kind,
	);
	for (const field of ["include", "exclude"]) {
		if (selector[field] === undefined) continue;
		assertArray(selector[field], lane.id + ".selector." + field);
		for (const path of selector[field])
			assertString(path, lane.id + ".selector path");
	}
	for (const field of ["config", "workspace", "project", "check"])
		if (selector[field] !== undefined)
			assertString(selector[field], lane.id + ".selector." + field);
}

export function validateAggregateAcyclicity(aggregates) {
	const visiting = new Set();
	const visited = new Set();
	const visit = (id, stack) => {
		if (visiting.has(id))
			throw new Error(
				"Validation aggregate cycle: " + [...stack, id].join(" -> "),
			);
		if (visited.has(id)) return;
		const aggregate = aggregates[id];
		if (!aggregate) return;
		visiting.add(id);
		for (const member of aggregate.lanes || [])
			if (aggregates[member]) visit(member, [...stack, id]);
		visiting.delete(id);
		visited.add(id);
	};
	for (const id of Object.keys(aggregates || {})) visit(id, []);
}

export function flattenAggregateLanes(aggregates, laneIds, aggregateId) {
	const flatten = (id, stack = []) => {
		assert(
			!stack.includes(id),
			"validation aggregate cycle: " + [...stack, id].join(" -> "),
		);
		const aggregate = aggregates[id];
		assert(aggregate, "validation aggregate " + id + " is required");
		return aggregate.lanes.flatMap((member) =>
			laneIds.has(member) ? [member] : flatten(member, [...stack, id]),
		);
	};
	return flatten(aggregateId);
}

export function validateValidationLanes(rootDir, lanes, topology, provenance) {
	assert(
		lanes && lanes.version === 1,
		"validation lane manifest version must be 1",
	);
	assert(
		lanes.runtimeMatrix && isObjectLike(lanes.runtimeMatrix),
		"validation runtimeMatrix is required",
	);
	for (const [runtimeId, runtime] of Object.entries(lanes.runtimeMatrix)) {
		assertString(runtimeId, "validation runtime id");
		assert(
			runtime && isObjectLike(runtime),
			runtimeId + " runtime is required",
		);
		assertString(runtime.kind, runtimeId + ".kind");
		assert(
			allowedRuntimes.has(runtime.kind),
			runtimeId + " has unknown runtime kind " + runtime.kind,
		);
		assertString(runtime.version, runtimeId + ".version");
	}
	assertArray(lanes.lanes, "validation lanes");
	assert(
		lanes.aggregates && isObjectLike(lanes.aggregates),
		"validation aggregates are required",
	);
	assertArray(lanes.unresolvedMappings, "validation unresolvedMappings");
	assertUnique(
		lanes.lanes.map((lane) => lane.id),
		"validation lane ids",
	);
	const laneIds = new Set(lanes.lanes.map((lane) => lane.id));
	const project = JSON.parse(
		readFileSync(resolve(rootDir, "project.json"), "utf8"),
	);
	const projectTargets = new Set(Object.keys(project.targets || {}));
	const packageJson = JSON.parse(
		readFileSync(resolve(rootDir, "package.json"), "utf8"),
	);
	const targetInvokesPublication = (target) => {
		const config = project.targets?.[target] || {};
		const commands = [
			packageJson.scripts?.[target],
			config.options?.command,
			...(config.options?.commands || []),
			config.metadata?.scriptContent,
			config.metadata?.runCommand,
		].filter((command) => isString(command));
		const hasPublicationCommand = commands.some((command) =>
			/(?:npm\s+publish|nx\s+release\s+publish|changeset\s+publish)/.test(
				command,
			),
		);
		if (hasPublicationCommand) return true;
		for (const command of commands) {
			const runMatch = /npm\s+run\s+(\S+)/.exec(command);
			if (runMatch && packageJson.scripts?.[runMatch[1]]) {
				if (
					/(?:npm\s+publish|nx\s+release\s+publish|changeset\s+publish)/.test(
						packageJson.scripts[runMatch[1]],
					)
				)
					return true;
			}
		}
		return false;
	};
	const aliases = new Set();
	for (const lane of lanes.lanes) {
		for (const field of [
			"id",
			"nxTarget",
			"mappingStatus",
			"selector",
			"runtimes",
			"credentials",
			"artifacts",
			"gate",
			"comparison",
		])
			assert(
				lane[field] !== undefined,
				"validation lane " + (lane.id || "?") + " needs " + field,
			);
		assertUnique([lane.id], "validation lane id");
		validateSelector(lane);
		assertArray(lane.runtimes, lane.id + ".runtimes");
		if (lane.workflowRuntimes !== undefined) {
			assertArray(lane.workflowRuntimes, lane.id + ".workflowRuntimes");
			for (const runtime of lane.workflowRuntimes)
				assert(
					lanes.runtimeMatrix[runtime],
					lane.id + " references unknown workflow runtime " + runtime,
				);
		}
		assertArray(lane.artifacts, lane.id + ".artifacts");
		assert(
			mappingStatuses.has(lane.mappingStatus),
			lane.id + " has unknown mappingStatus",
		);
		if (lane.mappingStatus === "mapped") {
			assertString(lane.nxTarget, lane.id + ".nxTarget");
			assert(
				projectTargets.has(lane.nxTarget),
				lane.id + " references missing Nx target " + lane.nxTarget,
			);
			assert(
				!targetInvokesPublication(lane.nxTarget),
				lane.id + " mapped target must not invoke changeset publish",
			);
		} else if (lane.mappingStatus === "external") {
			assert(
				lane.external === true,
				lane.id + " external mapping must be marked external",
			);
			assert(
				lane.nxTarget === null,
				lane.id + " external mapping must not invent an Nx target",
			);
			assertString(lane.integration, lane.id + ".integration");
		} else {
			assert(
				lane.nxTarget === null,
				lane.id + " unresolved mapping must be explicit",
			);
			assertString(lane.mappingReason, lane.id + ".mappingReason");
		}
		assert(
			!("command" in lane),
			lane.id + " must not encode dispatcher commands",
		);
		if (lane.alias !== undefined) {
			assertString(lane.alias, lane.id + ".alias");
			assert(
				!aliases.has(lane.alias),
				"validation lane alias duplicated: " + lane.alias,
			);
			assert(
				isString(packageJson.scripts[lane.alias]),
				lane.id + " alias is not a root script",
			);
			assert(
				!packageJson.scripts[lane.alias].includes("run-validation-lane.mjs"),
				lane.id + " alias recurses through the dispatcher",
			);
			aliases.add(lane.alias);
		}
		for (const runtime of lane.runtimes)
			assert(
				lanes.runtimeMatrix[runtime],
				lane.id + " references unknown runtime " + runtime,
			);
		assertArray(lane.credentials, lane.id + ".credentials");
		assert(
			lane.credentials.every((credential) =>
				/^[A-Z][A-Z0-9_]+$/.test(credential),
			),
			lane.id + " credentials must be environment variable names",
		);
		assert(
			gateKinds.has(lane.gate),
			lane.id + " has unknown gate " + lane.gate,
		);
		assertString(lane.comparison, lane.id + ".comparison");
		for (const artifact of lane.artifacts) {
			const output = provenance.outputs.find((entry) => entry.id === artifact);
			const candidate = provenance.candidates.find(
				(entry) => entry.id === artifact,
			);
			assert(
				output || candidate,
				lane.id + " references unknown artifact " + artifact,
			);
			if (output)
				assert(
					output.owners.includes(lane.id),
					lane.id + " references output it does not own: " + artifact,
				);
			else
				assert(
					candidate.validation.includes(lane.id),
					lane.id + " references candidate it does not validate: " + artifact,
				);
		}
	}
	const laneById = new Map(lanes.lanes.map((lane) => [lane.id, lane]));
	for (const candidate of provenance.candidates) {
		const linkedArtifacts = new Set([candidate.id, ...candidate.outputs]);
		for (const laneId of candidate.validation) {
			const lane = laneById.get(laneId);
			assert(
				lane.artifacts.some((artifact) => linkedArtifacts.has(artifact)),
				candidate.id +
					" validation lane does not reference the candidate or an output: " +
					laneId,
			);
		}
	}
	const aggregates = lanes.aggregates;
	validateAggregateAcyclicity(aggregates);
	const unresolved = new Set(lanes.unresolvedMappings.map((entry) => entry.id));
	const laneStatuses = new Map(
		lanes.lanes.map((lane) => [lane.id, lane.mappingStatus]),
	);
	for (const lane of lanes.lanes)
		if (lane.mappingStatus === "unresolved") unresolved.add(lane.id);
	for (const [id, aggregate] of Object.entries(aggregates)) {
		assertArray(aggregate.lanes, "aggregate " + id + ".lanes");
		assert(
			mappingStatuses.has(aggregate.mappingStatus),
			id + " has unknown mappingStatus",
		);
		if (aggregate.mappingStatus === "mapped") {
			assertString(aggregate.nxTarget, id + ".nxTarget");
			assert(
				projectTargets.has(aggregate.nxTarget),
				id + " references missing Nx target " + aggregate.nxTarget,
			);
			assert(
				!targetInvokesPublication(aggregate.nxTarget),
				id + " mapped target must not invoke changeset publish",
			);
		} else if (aggregate.mappingStatus === "external") {
			assert(
				aggregate.external === true,
				id + " external mapping must be marked external",
			);
			assert(
				aggregate.nxTarget === null,
				id + " external mapping must not invent an Nx target",
			);
			assertString(aggregate.integration, id + ".integration");
			assert(
				!("mappingReason" in aggregate),
				id + " external mapping must not be unresolved",
			);
		} else {
			assert(
				aggregate.nxTarget === null,
				id + " non-mapped aggregate must not invent an Nx target",
			);
			assertString(aggregate.mappingReason, id + ".mappingReason");
			unresolved.add(id);
		}
		for (const member of aggregate.lanes)
			assert(
				laneIds.has(member) || Object.hasOwn(aggregates, member),
				id + " references unknown lane or aggregate " + member,
			);
	}
	for (const [id, aggregate] of Object.entries(aggregates)) {
		if (aggregate.workflowRuntimes === undefined) continue;
		assert(
			aggregate.workflowRuntimes &&
				isObjectLike(aggregate.workflowRuntimes) &&
				!Array.isArray(aggregate.workflowRuntimes),
			id + ".workflowRuntimes must be an object",
		);
		const members = new Set(flattenAggregateLanes(aggregates, laneIds, id));
		for (const [laneId, runtimes] of Object.entries(
			aggregate.workflowRuntimes,
		)) {
			assert(
				members.has(laneId),
				id +
					".workflowRuntimes references a lane outside the aggregate: " +
					laneId,
			);
			assertArray(runtimes, id + ".workflowRuntimes." + laneId);
			assert(
				runtimes.length > 0 &&
					runtimes.every(
						(runtime) =>
							isString(runtime) &&
							runtime.length > 0 &&
							lanes.runtimeMatrix[runtime],
					),
				id + ".workflowRuntimes." + laneId + " references an unknown runtime",
			);
		}
	}
	for (const entry of lanes.unresolvedMappings) {
		assertString(entry.id, "unresolved mapping id");
		assertString(entry.reason, entry.id + ".reason");
		assert(
			laneIds.has(entry.id) || Object.hasOwn(aggregates, entry.id),
			"unresolved mapping references unknown identity " + entry.id,
		);
	}
	assert(
		[...unresolved].every((id) =>
			lanes.unresolvedMappings.some((entry) => entry.id === id),
		),
		"every unresolved mapping needs an explicit decision record",
	);
	const containsUnresolvedMember = (id, stack = []) => {
		if (stack.includes(id)) return false;
		if (unresolved.has(id)) return true;
		const aggregate = aggregates[id];
		if (!aggregate) return laneStatuses.get(id) === "unresolved";
		if (aggregate.mappingStatus === "unresolved") return true;
		return aggregate.lanes.some((member) =>
			containsUnresolvedMember(member, [...stack, id]),
		);
	};
	for (const [id, aggregate] of Object.entries(aggregates))
		if (aggregate.mappingStatus === "external")
			assert(
				!containsUnresolvedMember(id),
				id + " external aggregate includes an unresolved member",
			);
	for (const [id, aggregate] of Object.entries(aggregates))
		if (aggregate.mappingStatus === "mapped")
			assert(
				!containsUnresolvedMember(id),
				id + " mapped aggregate includes an unresolved member",
			);
	const aggregateTargetMembers = (id) =>
		(aggregates[id]?.lanes ?? []).map((member) => {
			const lane = laneById.get(member);
			return lane?.nxTarget ?? aggregates[member]?.nxTarget;
		});
	const sortTargets = (values) =>
		[...new Set(values)].sort((left, right) => left.localeCompare(right));
	for (const [id, aggregate] of Object.entries(aggregates)) {
		if (aggregate.mappingStatus !== "mapped") continue;
		const target = project.targets[aggregate.nxTarget];
		const expected = aggregateTargetMembers(id);
		const actual = (target.dependsOn ?? []).map((dependency) =>
			isString(dependency) ? dependency : dependency.target,
		);
		assert(
			actual.every((dependency) => isString(dependency)),
			id + " mapped target dependencies must be target names",
		);
		assert(
			JSON.stringify(sortTargets(actual)) ===
				JSON.stringify(sortTargets(expected)),
			id +
				" Nx target dependsOn must match aggregate members; expected " +
				expected.join(", ") +
				" but found " +
				actual.join(", "),
		);
	}
	return lanes;
}

export function validateControlPlane(rootDir = repositoryRoot) {
	const controlPlane = loadControlPlane(rootDir);
	const artifactIds = new Set([
		...controlPlane.provenance.outputs.map((entry) => entry.id),
		...controlPlane.provenance.candidates.map((entry) => entry.id),
	]);
	validateTopology(rootDir, controlPlane.topology, artifactIds);
	validateArtifactProvenance(
		controlPlane.provenance,
		controlPlane.topology,
		new Set(controlPlane.lanes.lanes.map((lane) => lane.id)),
		rootDir,
	);
	validateValidationLanes(
		rootDir,
		controlPlane.lanes,
		controlPlane.topology,
		controlPlane.provenance,
	);
	return controlPlane;
}
