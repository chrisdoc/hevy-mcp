import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const expected = new Map([
	["packages/hevy-client", { name: "@hevy-mcp/hevy-client", private: true }],
	["packages/core", { name: "@hevy-mcp/core", private: true }],
	["packages/node", { name: "hevy-mcp", private: false }],
	["packages/worker", { name: "@hevy-mcp/worker", private: true }],
	["packages/cli", { name: "@chrisdoc/hevy-cli", private: false }],
]);

const rootPackage = JSON.parse(
	await readFile(resolve(root, "package.json"), "utf8"),
);
if (JSON.stringify(rootPackage.workspaces) !== JSON.stringify(["packages/*"])) {
	throw new Error("Root package.json must declare packages/* workspaces");
}
const actualWorkspaces = (
	await readdir(resolve(root, "packages"), { withFileTypes: true })
)
	.filter((entry) => entry.isDirectory())
	.map((entry) => `packages/${entry.name}`)
	.sort();
const expectedWorkspaces = [...expected.keys()].sort();
if (JSON.stringify(actualWorkspaces) !== JSON.stringify(expectedWorkspaces)) {
	throw new Error(
		`Workspace registry mismatch: expected ${expectedWorkspaces.join(", ")}; found ${actualWorkspaces.join(", ")}`,
	);
}
let publishableCount = 0;
for (const [relative, metadata] of expected) {
	const packageJson = JSON.parse(
		await readFile(resolve(root, relative, "package.json"), "utf8"),
	);
	const isPrivate = packageJson.private === true;
	if (packageJson.name !== metadata.name || isPrivate !== metadata.private) {
		throw new Error(
			`${relative}/package.json has unexpected workspace metadata`,
		);
	}
	if (!isPrivate) publishableCount += 1;
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
const expectedPublishableCount = [...expected.values()].filter(
	({ private: isPrivate }) => !isPrivate,
).length;
if (publishableCount !== expectedPublishableCount)
	throw new Error(
		`Expected exactly ${expectedPublishableCount} publishable workspaces, found ${publishableCount}`,
	);
console.log("Workspace identities and publication ownership are valid.");
