import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sinceIndex = process.argv.indexOf("--since");
const since = sinceIndex >= 0 ? process.argv[sinceIndex + 1] : "origin/main";

if (!since) throw new Error("Missing value for --since");

const { stdout } = await execFileAsync(
	"git",
	["diff", "--name-only", "--diff-filter=ACMRD", `${since}...HEAD`],
	{ cwd: root },
);
const changedFiles = stdout.trim().split("\n").filter(Boolean);

async function readPackageName(packagePath) {
	const manifestPath = `${packagePath}/package.json`;
	let contents;

	try {
		contents = await readFile(resolve(root, manifestPath), "utf8");
	} catch {
		try {
			const result = await execFileAsync(
				"git",
				["show", `${since}:${manifestPath}`],
				{ cwd: root },
			);
			contents = result.stdout;
		} catch {
			return undefined;
		}
	}

	try {
		const packageJson = JSON.parse(contents);
		return typeof packageJson.name === "string" ? packageJson.name : undefined;
	} catch {
		return undefined;
	}
}

const changedPackagePaths = new Set();
for (const file of changedFiles) {
	const match = file.match(/^packages\/([^/]+)(?:\/|$)/);
	if (match) changedPackagePaths.add(`packages/${match[1]}`);
}

const changedPackages = new Map();
for (const path of changedPackagePaths) {
	const packageName = await readPackageName(path);
	if (packageName) changedPackages.set(path, packageName);
}

if (changedPackages.size === 0) {
	console.log("No workspace package changes require a package changeset.");
	process.exit(0);
}

const { stdout: changesetDiff } = await execFileAsync(
	"git",
	[
		"diff",
		"--name-status",
		"--find-renames",
		`${since}...HEAD`,
		"--",
		".changeset",
	],
	{ cwd: root },
);
const changedChangesetFiles = changesetDiff
	.trim()
	.split("\n")
	.filter(Boolean)
	.flatMap((line) => {
		const [status, sourcePath, destinationPath] = line.split("\t");
		if (status === "A" || status === "M") return [sourcePath];
		if (status.startsWith("R") && status !== "R100") {
			return [destinationPath];
		}
		return [];
	})
	.filter((file) => /^\.changeset\/[^/]+\.md$/.test(file));

const changesetPackages = new Set();
let changedChangesetCount = 0;
for (const file of changedChangesetFiles) {
	let contents;
	try {
		contents = await readFile(resolve(root, file), "utf8");
	} catch {
		continue;
	}
	changedChangesetCount += 1;
	const frontmatter = contents.match(/^---\s*\n([\s\S]*?)\n---/);
	if (!frontmatter) continue;
	for (const line of frontmatter[1].split("\n")) {
		const match = line.match(
			/^\s*(?:"([^"]+)"|'([^']+)'|([@A-Za-z0-9._/-]+))\s*:/,
		);
		if (match) changesetPackages.add(match[1] ?? match[2] ?? match[3]);
	}
}

if (changedChangesetCount === 0) {
	throw new Error(
		`Changed workspace packages need a changeset added or modified by this branch:\n${[...changedPackages.entries()].map(([path, packageName]) => `- ${path} -> ${packageName}`).join("\n")}`,
	);
}

const missing = [...changedPackages.entries()]
	.filter(([, packageName]) => !changesetPackages.has(packageName))
	.map(([path, packageName]) => `${path} -> ${packageName}`);

if (missing.length > 0) {
	throw new Error(
		`Changed workspace packages need a changeset naming the same package:\n${missing.map((entry) => `- ${entry}`).join("\n")}`,
	);
}

const bundledRuntimePackages = new Set([
	"@hevy-mcp/core",
	"@hevy-mcp/hevy-client",
]);
if (
	[...bundledRuntimePackages].some((packageName) =>
		changesetPackages.has(packageName),
	) &&
	!changesetPackages.has("hevy-mcp")
) {
	throw new Error(
		"Changesets releasing @hevy-mcp/core or @hevy-mcp/hevy-client must also release hevy-mcp because those packages are bundled into the public package.",
	);
}

console.log(
	`Package changeset coverage passed for ${changedPackages.size} workspace package(s).`,
);
