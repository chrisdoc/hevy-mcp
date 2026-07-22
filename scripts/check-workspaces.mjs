import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const expected = new Map([
	["packages/hevy-client", { name: "@hevy-mcp/hevy-client", private: true }],
	["packages/core", { name: "@hevy-mcp/core", private: true }],
	["packages/node", { name: "hevy-mcp", private: false }],
	["packages/worker", { name: "@hevy-mcp/worker", private: true }],
]);

const rootPackage = JSON.parse(
	await readFile(resolve(root, "package.json"), "utf8"),
);
if (JSON.stringify(rootPackage.workspaces) !== JSON.stringify(["packages/*"])) {
	throw new Error("Root package.json must declare packages/* workspaces");
}
let publishableCount = 0;
for (const [relative, metadata] of expected) {
	const packageJson = JSON.parse(
		await readFile(resolve(root, relative, "package.json"), "utf8"),
	);
	if (
		packageJson.name !== metadata.name ||
		packageJson.private !== metadata.private
	) {
		throw new Error(
			`${relative}/package.json has unexpected workspace metadata`,
		);
	}
	if (packageJson.private !== true) publishableCount += 1;
}
if (rootPackage.private !== true)
	throw new Error("Root orchestration package must be private");
for (const field of [
	"version",
	"main",
	"module",
	"types",
	"bin",
	"files",
	"publishConfig",
]) {
	if (field in rootPackage) {
		throw new Error(`Root orchestration package must not declare ${field}`);
	}
}
if (publishableCount !== 1)
	throw new Error(
		`Expected exactly one publishable workspace, found ${publishableCount}`,
	);
console.log("Workspace identities and publication ownership are valid.");
