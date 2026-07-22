import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const expected = new Map([
	["packages/hevy-client", [".", "./types", "./schemas"]],
	["packages/core", ["."]],
	["packages/node", ["."]],
	["packages/worker", ["."]],
]);

const errors = [];
for (const [relative, allowed] of expected) {
	const path = resolve(root, relative, "package.json");
	let pkg;
	try {
		pkg = JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		errors.push(`${relative}: unable to read package.json (${error.message})`);
		continue;
	}
	if (!pkg.private && relative !== "packages/node") {
		errors.push(`${relative}: package must be private during migration`);
	}
	if (!pkg.exports || typeof pkg.exports !== "object") {
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
		const record = typeof target === "string" ? { import: target } : target;
		if (!record || typeof record !== "object") {
			errors.push(`${relative}: export ${key} must be a condition map`);
			continue;
		}
		for (const [condition, value] of Object.entries(record)) {
			if (typeof value !== "string") {
				errors.push(`${relative}: export ${key}.${condition} must be a string`);
				continue;
			}
			if (value.includes("*") || value.includes("node_modules")) {
				errors.push(
					`${relative}: export ${key}.${condition} uses an unstable target`,
				);
			}
			if (relative === "packages/node" && !value.startsWith("./dist/")) {
				errors.push(
					`${relative}: public export ${key}.${condition} must target built dist files`,
				);
			}
			if (value.startsWith("./dist/") && relative !== "packages/node") {
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
