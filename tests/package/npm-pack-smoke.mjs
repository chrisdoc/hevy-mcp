import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function runNpm(args, options = {}) {
	const result = spawnSync(npmCommand, args, {
		encoding: "utf8",
		env: process.env,
		...options,
	});

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		if (result.stdout) console.error(result.stdout);
		if (result.stderr) console.error(result.stderr);
		process.exit(result.status ?? 1);
	}

	return result;
}

runNpm(["run", "check:server-manifest"], { stdio: "inherit" });
runNpm(["run", "build"], { stdio: "inherit" });

const result = spawnSync(
	npmCommand,
	["pack", "--dry-run", "--json", "--ignore-scripts", "--silent"],
	{
		encoding: "utf8",
		env: process.env,
	},
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

let packResult;
try {
	const parsed = JSON.parse(result.stdout);
	packResult = Array.isArray(parsed)
		? parsed[0]
		: parsed.files
			? parsed
			: Object.values(parsed)[0];
} catch (error) {
	throw new Error(`Could not parse npm pack output: ${error.message}`);
}

if (!packResult || !Array.isArray(packResult.files)) {
	throw new Error("npm pack did not return a package file inventory");
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const files = new Set(packResult.files.map(({ path }) => path));
const requiredFiles = [
	"README.md",
	"dist/cli.mjs",
	"dist/index.d.mts",
	"dist/index.mjs",
	"package.json",
	"server.json",
];

for (const path of requiredFiles) {
	if (!files.has(path)) {
		throw new Error(`Packed package is missing required file: ${path}`);
	}
}

if (packageJson.bin?.["hevy-mcp"] !== "dist/cli.mjs") {
	throw new Error("package.json must expose hevy-mcp from dist/cli.mjs");
}

console.log(
	`Package smoke passed: ${packResult.files.length} files, ${packResult.size} bytes.`,
);
