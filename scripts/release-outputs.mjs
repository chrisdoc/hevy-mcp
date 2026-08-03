import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	loadTopology,
	repositoryRoot,
	workspaceById,
} from "./repository-control-plane.mjs";

const execFileAsync = promisify(execFile);
const topology = loadTopology(repositoryRoot);
const canonicalNodePackageName = workspaceById(topology, "node").name;

function readVersion(manifest, packageName) {
	const packageJson = JSON.parse(manifest);
	if (typeof packageJson.version !== "string") {
		throw new Error(`${packageName} manifest has no version`);
	}
	return packageJson.version;
}

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

	return {
		version: nodeReleased ? nodeRelease.version : "",
		released: didPublish,
		node_released: nodeReleased,
		worker_released:
			readVersion(beforeWorkerManifest, "Previous Worker") !==
			readVersion(afterWorkerManifest, "Current Worker"),
	};
}

async function readWorkerManifest(revision) {
	const worker = workspaceById(topology, "worker");
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
	const node = workspaceById(topology, "node");
	const outputs = calculateReleaseOutputs({
		beforeWorkerManifest: await readWorkerManifest(beforeRevision),
		afterWorkerManifest: await readWorkerManifest(afterRevision),
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
