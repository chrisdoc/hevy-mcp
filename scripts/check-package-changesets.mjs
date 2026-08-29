import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	loadTopology,
	releaseConsumers,
	workspaceById,
	workspaceByName,
} from "./repository-control-plane.mjs";
import { isString } from "./runtime-value-predicates.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Evaluate package-changeset coverage for a set of changed files.
 *
 * Pure repository logic: every input (which files changed, how changeset
 * files changed, and the base-revision manifest fallback) arrives as a
 * parameter so tests can drive it with ordinary filesystem fixtures without
 * invoking Git. The CLI wrapper gathers those inputs from Git.
 *
 * Returns `{ changedPackageCount }` on success and throws an Error with a
 * human-readable message when coverage is incomplete.
 */
export async function packageChangesetCoverage({
	root,
	changedFiles,
	readManifestFromBase,
	changesetDiffLines,
}) {
	const topology = loadTopology(root);
	const releaseTriggerFiles = new Map(
		topology.release.triggers.map((trigger) => [
			trigger.path,
			workspaceById(topology, trigger.workspace).name,
		]),
	);
	const releaseBumps = new Set(["patch", "minor", "major"]);

	async function readPackageName(packagePath) {
		const manifestPath = `${packagePath}/package.json`;
		let contents;

		try {
			contents = await readFile(resolve(root, manifestPath), "utf8");
		} catch {
			contents = await readManifestFromBase(packagePath);
			if (contents === undefined) return undefined;
		}

		try {
			const packageJson = JSON.parse(contents);
			return isString(packageJson.name) ? packageJson.name : undefined;
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
	for (const file of changedFiles) {
		const packageName = releaseTriggerFiles.get(file);
		if (packageName) changedPackages.set(file, packageName);
	}

	if (changedPackages.size === 0) {
		console.log("No workspace package changes require a package changeset.");
		return { changedPackageCount: 0 };
	}

	const changedChangesetFiles = changesetDiffLines
		.flatMap((line) => {
			const [status, sourcePath, destinationPath] = line.split("\t");
			if (status === "A" || status === "M") return [sourcePath];
			if (status.startsWith("R") && status !== "R100") {
				return [destinationPath];
			}
			return [];
		})
		.filter((file) => /^\.changeset\/[^/]+\.md$/.test(file));

	const changesetReleases = new Set();
	const emptyChangesetFiles = [];
	let changedChangesetCount = 0;
	for (const file of changedChangesetFiles) {
		let contents;
		try {
			contents = await readFile(resolve(root, file), "utf8");
		} catch {
			continue;
		}
		changedChangesetCount += 1;
		const fileReleases = new Set();
		const frontmatter = contents.match(/^---\s*\n([\s\S]*?)\n---/);
		if (frontmatter) {
			for (const line of frontmatter[1].split("\n")) {
				const match = line.match(
					/^\s*(?:"([^"]+)"|'([^']+)'|([@A-Za-z0-9._/-]+))\s*:\s*([A-Za-z]+)\s*$/,
				);
				if (!match) continue;
				const packageName = match[1] ?? match[2] ?? match[3];
				const bump = match[4];
				if (!releaseBumps.has(bump)) continue;
				fileReleases.add(packageName);
				changesetReleases.add(packageName);
			}
		}
		if (fileReleases.size === 0) emptyChangesetFiles.push(file);
	}

	if (changedChangesetCount === 0) {
		throw new Error(
			`Changed workspace packages need a changeset added or modified by this branch:\n${Array.from(changedPackages.entries(), ([path, packageName]) => `- ${path} -> ${packageName}`).join("\n")}`,
		);
	}

	if (emptyChangesetFiles.length > 0) {
		throw new Error(
			`Empty Changesets cannot accompany release-triggering changes:\n${emptyChangesetFiles.map((file) => `- ${file}`).join("\n")}\nRelease-triggering changes require non-empty bumps:\n${Array.from(changedPackages.entries(), ([path, packageName]) => `- ${path} -> ${packageName}`).join("\n")}`,
		);
	}

	const missing = [...changedPackages.entries()]
		.filter(([, packageName]) => !changesetReleases.has(packageName))
		.map(([path, packageName]) => `${path} -> ${packageName}`);

	if (missing.length > 0) {
		throw new Error(
			`Changed workspace packages need a changeset naming the same package:\n${missing.map((entry) => `- ${entry}`).join("\n")}`,
		);
	}

	function getTransitiveConsumers(packageName) {
		let workspace;
		try {
			workspace = workspaceByName(topology, packageName);
		} catch {
			return [];
		}
		return releaseConsumers(topology, workspace.id).map(
			(consumer) => workspaceById(topology, consumer).name,
		);
	}

	const cascadeRoots = topology.release.bundles.map(
		(bundle) => workspaceById(topology, bundle.workspace).name,
	);
	const incompleteCascades = cascadeRoots
		.filter((packageName) => changesetReleases.has(packageName))
		.map((packageName) => ({
			packageName,
			missing: getTransitiveConsumers(packageName).filter(
				(consumer) => !changesetReleases.has(consumer),
			),
		}))
		.filter(({ missing }) => missing.length > 0);

	if (incompleteCascades.length > 0) {
		throw new Error(
			`Bundled release cascades must include every transitive shipped consumer with at least a patch bump:\n${incompleteCascades
				.map(
					({ packageName, missing }) =>
						`- ${packageName} -> missing ${missing.join(", ")}`,
				)
				.join("\n")}`,
		);
	}

	const allowedReleases = new Set();
	for (const packageName of changedPackages.values()) {
		allowedReleases.add(packageName);
		for (const consumer of getTransitiveConsumers(packageName)) {
			allowedReleases.add(consumer);
		}
	}
	const unrelatedReleases = [...changesetReleases].filter(
		(packageName) => !allowedReleases.has(packageName),
	);
	if (unrelatedReleases.length > 0) {
		throw new Error(
			`Changesets must not couple unrelated package releases:\n${unrelatedReleases
				.map((packageName) => `- ${packageName}`)
				.join("\n")}`,
		);
	}

	console.log(
		`Package changeset coverage passed for ${changedPackages.size} workspace package(s).`,
	);
	return { changedPackageCount: changedPackages.size };
}

const isMain =
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
	const sinceIndex = process.argv.indexOf("--since");
	const since = sinceIndex >= 0 ? process.argv[sinceIndex + 1] : "origin/main";

	if (!since) throw new Error("Missing value for --since");

	const { stdout } = await execFileAsync(
		"git",
		["diff", "--name-only", "--diff-filter=ACMRD", `${since}...HEAD`],
		{ cwd: root },
	);
	const changedFiles = stdout.trim().split("\n").filter(Boolean);
	const readManifestFromBase = async (packagePath) => {
		try {
			const result = await execFileAsync(
				"git",
				["show", `${since}:${packagePath}/package.json`],
				{ cwd: root },
			);
			return result.stdout;
		} catch {
			return undefined;
		}
	};
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

	try {
		await packageChangesetCoverage({
			root,
			changedFiles,
			readManifestFromBase,
			changesetDiffLines: changesetDiff.trim().split("\n").filter(Boolean),
		});
	} catch (error) {
		console.error(error.message);
		process.exit(1);
	}
}
