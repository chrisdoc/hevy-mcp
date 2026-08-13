import { access, readFile } from "node:fs/promises";
import { isObjectLike, isString } from "./runtime-value-predicates.mjs";
import { resolve } from "node:path";
import { loadTopology, repositoryRoot } from "./repository-control-plane.mjs";

const root = repositoryRoot;
const topology = loadTopology(root);

const errors = [];
for (const workspace of topology.workspaces) {
	const { path: relative } = workspace;
	const allowed = workspace.exports.map((key) =>
		key === "." ? "." : `./${key.replace(/^\.\//, "")}`,
	);
	const path = resolve(root, relative, "package.json");
	let pkg;
	try {
		pkg = JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		errors.push(`${relative}: unable to read package.json (${error.message})`);
		continue;
	}
	if ((pkg.private !== true) !== workspace.publishable) {
		errors.push(`${relative}: package private/publishable metadata disagrees`);
	}
	if (allowed.length === 0) {
		if (pkg.exports !== undefined)
			errors.push(`${relative}: topology declares no public exports`);
		continue;
	}
	if (!pkg.exports || !isObjectLike(pkg.exports)) {
		errors.push(`${relative}: exports map is required`);
		continue;
	}
	const keys = Object.keys(pkg.exports);
	for (const key of keys) {
		if (!allowed.includes(key))
			errors.push(`${relative}: unexpected export ${key}`);
		if (key.includes("*"))
			errors.push(`${relative}: wildcard exports are forbidden`);
	}
	for (const key of allowed) {
		if (!(key in pkg.exports))
			errors.push(`${relative}: missing export ${key}`);
	}
	for (const [key, target] of Object.entries(pkg.exports)) {
		const record = isString(target) ? { import: target } : target;
		if (!record || !isObjectLike(record)) {
			errors.push(`${relative}: export ${key} must be a condition map`);
			continue;
		}
		for (const [condition, value] of Object.entries(record)) {
			if (!isString(value)) {
				errors.push(`${relative}: export ${key}.${condition} must be a string`);
				continue;
			}
			if (value.includes("*") || value.includes("node_modules")) {
				errors.push(
					`${relative}: export ${key}.${condition} uses an unstable target`,
				);
			}
			if (workspace.publishable && !value.startsWith("./dist/")) {
				errors.push(
					`${relative}: public export ${key}.${condition} must target built dist files`,
				);
			}
			if (value.startsWith("./dist/") && !workspace.publishable) {
				try {
					await access(resolve(root, relative, value));
				} catch {
					// Built artifacts are optional for private source packages.
				}
			}
		}
	}
}

if (errors.length > 0) {
	console.error(errors.join("\n"));
	process.exitCode = 1;
} else {
	console.log("Package export maps are valid.");
}
