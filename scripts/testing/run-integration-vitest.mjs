import { spawnSync } from "node:child_process";
import { loadOptionalEnvFile } from "./load-optional-env.mjs";

const [testFile, ...vitestArgs] = process.argv.slice(2);
if (!testFile) {
	throw new Error(
		"run-integration-vitest.mjs requires a test file or directory",
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
