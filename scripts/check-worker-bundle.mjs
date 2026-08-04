import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	loadArtifactProvenance,
	loadTopology,
	repositoryRoot,
	workspaceById,
} from "./repository-control-plane.mjs";

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function uniqueProvenanceEntry(provenance, collection, id) {
	const entries = provenance?.[collection];
	assert(
		Array.isArray(entries),
		`Artifact provenance ${collection} entries are required`,
	);
	const matches = entries.filter((entry) => entry?.id === id);
	assert(
		matches.length === 1,
		`Artifact provenance ${collection} entry ${id} must be unique`,
	);
	const [entry] = matches;
	assert(
		Array.isArray(entry.paths) && entry.paths.length === 1,
		`Artifact provenance ${collection} entry ${id} must own exactly one path`,
	);
	const [path] = entry.paths;
	assert(
		typeof path === "string" && path.length > 0,
		`Artifact provenance ${collection} entry ${id} path must be non-empty`,
	);
	return path;
}

function uniqueWorkspace(topology, id) {
	assert(
		Array.isArray(topology?.workspaces),
		"Repository topology workspaces are required",
	);
	const matches = topology.workspaces.filter(
		(workspace) => workspace?.id === id,
	);
	assert(
		matches.length === 1,
		`Workspace ${id} must be unique in repository topology`,
	);
	return workspaceById(topology, id);
}

function resolveOutputDirectory(provenance, rootDir) {
	const path = uniqueProvenanceEntry(provenance, "outputs", "worker-dry-run");
	assert(
		/\/\*\*?$/.test(path),
		"Worker dry-run provenance must describe a directory glob",
	);
	return resolve(rootDir, path.replace(/\/\*\*?$/, ""));
}

async function scan(path, unresolvedPrivateImports, failures) {
	const entries = await readdir(path, { withFileTypes: true });
	for (const entry of entries) {
		const target = resolve(path, entry.name);
		if (entry.isDirectory())
			await scan(target, unresolvedPrivateImports, failures);
		else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) {
			const source = await readFile(target, "utf8");
			if (unresolvedPrivateImports.some((name) => source.includes(name))) {
				failures.push(target);
			}
		}
	}
}

export async function checkWorkerBundle({ rootDir = repositoryRoot } = {}) {
	const provenance = loadArtifactProvenance(rootDir);
	const topology = loadTopology(rootDir);
	const worker = uniqueWorkspace(topology, "worker");
	assert(
		Array.isArray(worker.dependencies),
		"Worker workspace dependencies are required",
	);
	const unresolvedPrivateImports = worker.dependencies.map((dependency) => {
		const workspace = uniqueWorkspace(topology, dependency);
		assert(
			workspace.private === true,
			`Worker dependency ${dependency} must be a private workspace`,
		);
		assert(
			typeof workspace.name === "string" && workspace.name.length > 0,
			`Worker dependency ${dependency} package name is required`,
		);
		return workspace.name;
	});
	const outputDir = resolveOutputDirectory(provenance, rootDir);
	if (!existsSync(outputDir)) {
		throw new Error(
			`Worker bundle output directory does not exist: ${outputDir}. ` +
				"Run the worker bundle build step first (e.g., npm run worker:dry-run).",
		);
	}
	const failures = [];
	await scan(outputDir, unresolvedPrivateImports, failures);
	return { failures, outputDir, unresolvedPrivateImports };
}

const isCli =
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isCli) {
	try {
		const result = await checkWorkerBundle();
		if (result.failures.length > 0) {
			console.error(
				`Worker bundle contains private workspace imports:\n${result.failures.join("\n")}`,
			);
			process.exitCode = 1;
		} else {
			console.log(
				"Worker bundle contains no unresolved private workspace imports.",
			);
		}
	} catch (error) {
		console.error(`check-worker-bundle: ${error.message}`);
		process.exitCode = 1;
	}
}
