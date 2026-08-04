import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadTopology, repositoryRoot } from "./repository-control-plane.mjs";

const root = repositoryRoot;
const topology = loadTopology(root);
const expectedPublishable = new Set(
	topology.workspaces
		.filter((workspace) => workspace.publishable)
		.map((workspace) => workspace.name),
);
const publishable = [];
for (const workspace of topology.workspaces) {
	const packagePath = resolve(root, workspace.path, "package.json");
	const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
	if (packageJson.private !== true) publishable.push(packageJson.name);
}
const unexpected = publishable.filter((name) => !expectedPublishable.has(name));
const missing = [...expectedPublishable].filter(
	(name) => !publishable.includes(name),
);
if (unexpected.length > 0 || missing.length > 0) {
	throw new Error(
		`Publishable package mismatch; unexpected: ${unexpected.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}`,
	);
}

console.log(
	"Publishable release candidates are limited to @chrisdoc/hevy-cli and hevy-mcp; private workspaces are versioned for internal releases only.",
);
