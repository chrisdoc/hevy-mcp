import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	loadTopology,
	repositoryRoot,
	workspaceById,
} from "./repository-control-plane.mjs";
import { resolveWorkerVersion } from "./resolve-worker-version.mjs";

const execFileAsync = promisify(execFile);
const topology = loadTopology(repositoryRoot);

function canonicalWorkspace(topologyValue, id) {
	if (!Array.isArray(topologyValue?.workspaces))
		throw new Error("Repository topology workspaces are required");
	const matches = topologyValue.workspaces.filter(
		(workspace) => workspace?.id === id,
	);
	if (matches.length !== 1)
		throw new Error(
			`Repository topology workspace ${id} must have exactly one identity`,
		);
	return workspaceById(topologyValue, id);
}

const canonicalNodePackageName = canonicalWorkspace(topology, "node").name;

export function calculateReleaseOutputs({
	afterWorkerManifest,
	beforeWorkerManifest,
	published,
	publishedPackages,
	nodePackageName = canonicalNodePackageName,
}) {
	if (!Array.isArray(publishedPackages)) {
		throw new Error("publishedPackages must be an array");
	}
	const didPublish = published === true || published === "true";
	const nodeRelease = publishedPackages.find(
		(candidate) => candidate?.name === nodePackageName,
	);
	const nodeReleased = didPublish && typeof nodeRelease?.version === "string";
	const beforeWorkerVersion = resolveWorkerVersion(beforeWorkerManifest);
	const workerVersion = resolveWorkerVersion(afterWorkerManifest);

	return {
		version: nodeReleased ? nodeRelease.version : "",
		released: didPublish,
		node_released: nodeReleased,
		worker_version: workerVersion,
		worker_released: beforeWorkerVersion !== workerVersion,
	};
}

async function readWorkerManifest(revision, topologyValue = topology) {
	const worker = canonicalWorkspace(topologyValue, "worker");
	const { stdout } = await execFileAsync(
		"git",
		["show", `${revision}:${worker.path}/package.json`],
		{ cwd: resolve(fileURLToPath(new URL("..", import.meta.url))) },
	);
	return stdout;
}

async function main() {
	const [beforeRevision, afterRevision] = process.argv.slice(2);
	if (!beforeRevision || !afterRevision) {
		throw new Error("Usage: release-outputs.mjs <before> <after>");
	}
	const node = canonicalWorkspace(topology, "node");
	const outputs = calculateReleaseOutputs({
		beforeWorkerManifest: await readWorkerManifest(beforeRevision, topology),
		afterWorkerManifest: await readWorkerManifest(afterRevision, topology),
		published: process.env.PUBLISHED,
		publishedPackages: JSON.parse(process.env.PKGS || "[]"),
		nodePackageName: node.name,
	});
	for (const [name, value] of Object.entries(outputs)) {
		console.log(`${name}=${value}`);
	}
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	await main();
}
