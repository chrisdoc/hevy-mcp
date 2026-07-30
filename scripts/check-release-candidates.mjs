import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(root, "packages");
const workspaceEntries = await readdir(workspaceRoot, { withFileTypes: true });
const publishable = [];
for (const entry of workspaceEntries) {
	if (!entry.isDirectory()) continue;
	const packagePath = resolve(workspaceRoot, entry.name, "package.json");
	const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
	if (packageJson.private !== true) publishable.push(packageJson.name);
}

const expectedPublishable = new Set(["@chrisdoc/hevy-cli", "hevy-mcp"]);
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
