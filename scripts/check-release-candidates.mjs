import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(root, "packages");
const changesetRoot = resolve(root, ".changeset");
const privatePackages = new Set([
	"@hevy-mcp/hevy-client",
	"@hevy-mcp/core",
	"@hevy-mcp/worker",
]);

const workspaceEntries = await readdir(workspaceRoot, { withFileTypes: true });
const publishable = [];
for (const entry of workspaceEntries) {
	if (!entry.isDirectory()) continue;
	const packagePath = resolve(workspaceRoot, entry.name, "package.json");
	const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
	if (packageJson.private !== true) publishable.push(packageJson.name);
}

const expectedPublishable = new Set(["hevy-cli", "hevy-mcp"]);
const unexpected = publishable.filter((name) => !expectedPublishable.has(name));
if (unexpected.length > 0) {
	throw new Error(
		`Unexpected publishable packages: ${unexpected.join(", ")}; expected hevy-cli and hevy-mcp`,
	);
}

const changesetEntries = await readdir(changesetRoot, { withFileTypes: true });
for (const entry of changesetEntries) {
	if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
	const contents = await readFile(resolve(changesetRoot, entry.name), "utf8");
	for (const packageName of privatePackages) {
		if (contents.includes(`"${packageName}"`)) {
			throw new Error(
				`Private workspace ${packageName} is a release candidate in ${entry.name}`,
			);
		}
	}
}

console.log("Release candidates are limited to hevy-cli and hevy-mcp.");
