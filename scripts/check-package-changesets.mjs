import { readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const packagesRoot = resolve(root, "packages");
const changesetRoot = resolve(root, ".changeset");
const sinceIndex = process.argv.indexOf("--since");
const since = sinceIndex >= 0 ? process.argv[sinceIndex + 1] : "origin/main";

if (!since) throw new Error("Missing value for --since");

const { stdout } = await execFileAsync("git", [
	"diff",
	"--name-only",
	"--diff-filter=ACMR",
	`${since}...HEAD`,
]);
const changedFiles = stdout.trim().split("\n").filter(Boolean);

const packageNames = new Map();
for (const entry of await readdir(packagesRoot, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	const packagePath = resolve(packagesRoot, entry.name, "package.json");
	try {
		const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
		packageNames.set(`packages/${entry.name}`, packageJson.name);
	} catch {
		// Ignore workspace directories without a package manifest.
	}
}

const changedPackages = new Map();
for (const file of changedFiles) {
	for (const [path, packageName] of packageNames) {
		if (file === path || file.startsWith(`${path}/`)) {
			changedPackages.set(path, packageName);
		}
	}
}

if (changedPackages.size === 0) {
	console.log("No workspace package changes require a package changeset.");
	process.exit(0);
}

const changesetPackages = new Set();
for (const entry of await readdir(changesetRoot, { withFileTypes: true })) {
	if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
	const contents = await readFile(resolve(changesetRoot, entry.name), "utf8");
	const frontmatter = contents.match(/^---\s*\n([\s\S]*?)\n---/);
	if (!frontmatter) continue;
	for (const line of frontmatter[1].split("\n")) {
		const match = line.match(
			/^\s*(?:"([^"]+)"|'([^']+)'|([@A-Za-z0-9._/-]+))\s*:/,
		);
		if (match) changesetPackages.add(match[1] ?? match[2] ?? match[3]);
	}
}

const missing = [...changedPackages.entries()]
	.filter(([, packageName]) => !changesetPackages.has(packageName))
	.map(([path, packageName]) => `${path} -> ${packageName}`);

if (missing.length > 0) {
	throw new Error(
		`Changed workspace packages need a changeset naming the same package:\n${missing.map((entry) => `- ${entry}`).join("\n")}`,
	);
}

console.log(
	`Package changeset coverage passed for ${changedPackages.size} workspace package(s).`,
);
