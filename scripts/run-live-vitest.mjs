import { spawnSync } from "node:child_process";
import { loadOptionalEnvFile } from "./load-optional-env.mjs";

const [requirementsArg, testFile, ...vitestArgs] = process.argv.slice(2);
if (!requirementsArg || !testFile) {
	throw new Error(
		"run-live-vitest.mjs requires an environment requirement list and test file",
	);
}

try {
	loadOptionalEnvFile();
} catch (error) {
	console.error(
		error instanceof Error ? error.message : "Unable to load .env.",
	);
	process.exit(1);
}

for (const requirement of requirementsArg.split(",")) {
	const [name, expected] = requirement.split("=", 2);
	const actual = process.env[name];
	if (!actual?.trim() || (expected !== undefined && actual !== expected)) {
		console.error(
			`${name}${expected ? `=${expected}` : ""} is required for ${testFile}; no live tests were started.`,
		);
		process.exit(1);
	}
}

const result = spawnSync(
	process.execPath,
	["node_modules/vitest/vitest.mjs", "run", testFile, ...vitestArgs],
	{
		stdio: "inherit",
		env: process.env,
	},
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
