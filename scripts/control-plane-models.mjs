import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptRoot, "..");
export const controlPlaneRoot = resolve(repositoryRoot, "repository");

function readJson(rootDir, fileName) {
	const path = resolve(rootDir, "repository", fileName);
	if (!existsSync(path)) return undefined;
	return JSON.parse(readFileSync(path, "utf8"));
}

export function loadTopology(rootDir = repositoryRoot) {
	const topology = readJson(rootDir, "topology.json");
	if (!topology) throw new Error("repository/topology.json is required");
	return topology;
}

export function loadArtifactProvenance(rootDir = repositoryRoot) {
	const provenance = readJson(rootDir, "artifact-provenance.json");
	if (!provenance)
		throw new Error("repository/artifact-provenance.json is required");
	return provenance;
}

export function loadValidationLanes(rootDir = repositoryRoot) {
	const lanes = readJson(rootDir, "validation-lanes.json");
	if (!lanes) throw new Error("repository/validation-lanes.json is required");
	return lanes;
}

export function loadProject(rootDir = repositoryRoot) {
	const projectPath = resolve(rootDir, "project.json");
	if (!existsSync(projectPath)) throw new Error("project.json is required");
	return JSON.parse(readFileSync(projectPath, "utf8"));
}

export function loadControlPlane(rootDir = repositoryRoot) {
	return {
		rootDir,
		topology: loadTopology(rootDir),
		provenance: loadArtifactProvenance(rootDir),
		lanes: loadValidationLanes(rootDir),
	};
}

export function workspaceById(topology, id) {
	const workspace = topology.workspaces.find((entry) => entry.id === id);
	if (!workspace) throw new Error(`Unknown workspace id ${id}`);
	return workspace;
}

export function workspaceByName(topology, name) {
	const workspace = topology.workspaces.find((entry) => entry.name === name);
	if (!workspace) throw new Error(`Unknown workspace package ${name}`);
	return workspace;
}

export function releaseConsumers(topology, workspaceId) {
	const graph = new Map(
		topology.release.bundles.map((bundle) => [
			bundle.workspace,
			bundle.consumers,
		]),
	);
	const consumers = new Set();
	const pending = [...(graph.get(workspaceId) ?? [])];
	while (pending.length > 0) {
		const candidate = pending.shift();
		if (!candidate || consumers.has(candidate)) continue;
		consumers.add(candidate);
		pending.push(...(graph.get(candidate) ?? []));
	}
	return [...consumers];
}

export function relativePath(rootDir, path) {
	return relative(rootDir, path).replaceAll("\\", "/");
}
