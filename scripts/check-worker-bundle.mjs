import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadTopology, workspaceById } from "./repository-control-plane.mjs";

const outputDir = resolve(".wrangler/dry-run");
const topology = loadTopology();
const worker = workspaceById(topology, "worker");
const unresolvedPrivateImports = worker.dependencies.map(
	(dependency) => workspaceById(topology, dependency).name,
);
const failures = [];
async function scan(path) {
	const entries = await readdir(path, { withFileTypes: true });
	for (const entry of entries) {
		const target = resolve(path, entry.name);
		if (entry.isDirectory()) await scan(target);
		else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) {
			const source = await readFile(target, "utf8");
			if (unresolvedPrivateImports.some((name) => source.includes(name))) {
				failures.push(target);
			}
		}
	}
}

await scan(outputDir);
if (failures.length > 0) {
	console.error(
		`Worker bundle contains private workspace imports:\n${failures.join("\n")}`,
	);
	process.exitCode = 1;
} else {
	console.log(
		"Worker bundle contains no unresolved private workspace imports.",
	);
}
