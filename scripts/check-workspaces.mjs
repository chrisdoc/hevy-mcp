import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import {
	loadTopology,
	validateControlPlane,
	repositoryRoot,
} from "./repository-control-plane.mjs";

const root = repositoryRoot;
const topology = loadTopology(root);
const expected = new Map(
	topology.workspaces.map((workspace) => [workspace.path, workspace]),
);

const rootPackage = JSON.parse(
	await readFile(resolve(root, "package.json"), "utf8"),
);
if (
	JSON.stringify(rootPackage.workspaces) !==
	JSON.stringify([topology.workspaceGlob])
) {
	throw new Error(
		`Root package.json must declare ${topology.workspaceGlob} workspaces`,
	);
}
const actualWorkspaces = (
	await readdir(resolve(root, "packages"), { withFileTypes: true })
)
	.filter((entry) => entry.isDirectory())
	.map((entry) => `packages/${entry.name}`)
	.sort((left, right) => left.localeCompare(right));
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
const expectedPublishableCount = topology.workspaces.filter(
	({ publishable }) => publishable,
).length;
if (publishableCount !== expectedPublishableCount)
	throw new Error(
		`Expected exactly ${expectedPublishableCount} publishable workspaces, found ${publishableCount}`,
	);
console.log("Workspace identities and publication ownership are valid.");

// Validate the linked topology/provenance/lane graph when this canonical
// workspace lane runs. The dedicated control-plane check emits the detailed
// diagnostics; this call prevents a workspace-only invocation from accepting
// stale linked models.
validateControlPlane(root);
