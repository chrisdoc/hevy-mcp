import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
	[
		"pack",
		"--workspace",
		"hevy-mcp",
		"--dry-run",
		"--json",
		"--ignore-scripts",
		"--silent",
	],
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

const packageJson = JSON.parse(
	readFileSync("packages/node/package.json", "utf8"),
);
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

for (const section of [
	"dependencies",
	"optionalDependencies",
	"peerDependencies",
]) {
	for (const name of Object.keys(packageJson[section] ?? {})) {
		if (name.startsWith("@hevy-mcp/")) {
			throw new Error(
				`Public package must not declare private workspace ${name}`,
			);
		}
	}
}

const emittedFiles = packResult.files
	.filter(({ path }) => /\.(?:mjs|cjs|js|d\.mts|d\.cts|d\.ts)$/.test(path))
	.map(({ path }) => path);
for (const path of emittedFiles) {
	const packedText = readFileSync(join("packages/node", path), "utf8");
	if (
		packedText.includes("@hevy-mcp/core") ||
		packedText.includes("@hevy-mcp/hevy-client")
	) {
		throw new Error(
			`Packed artifact contains a private workspace import: ${path}`,
		);
	}
}

console.log(
	`Package smoke passed: ${packResult.files.length} files, ${packResult.size} bytes.`,
);

const tempDir = mkdtempSync(join(tmpdir(), "hevy-mcp-pack-"));
try {
	const packed = runNpm(
		[
			"pack",
			"--workspace",
			"hevy-mcp",
			"--pack-destination",
			tempDir,
			"--silent",
		],
		{ stdio: "pipe" },
	);
	const tarballName = packed.stdout.trim().split("\n").at(-1);
	if (!tarballName || !existsSync(join(tempDir, tarballName))) {
		throw new Error("npm pack did not produce a real Node workspace tarball");
	}
	const tarball = join(tempDir, tarballName);
	const installDir = join(tempDir, "consumer");
	runNpm(["init", "--yes", "--prefix", installDir], { stdio: "pipe" });
	runNpm(
		[
			"install",
			"--prefix",
			installDir,
			tarball,
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
		],
		{ stdio: "pipe" },
	);
	const importCheck = spawnSync(
		process.execPath,
		[
			"-e",
			"import('hevy-mcp').then(({createNodeMcpServer,runStdioServer}) => { if (typeof createNodeMcpServer !== 'function' || typeof runStdioServer !== 'function') process.exit(1); })",
		],
		{ cwd: installDir, encoding: "utf8" },
	);
	if (importCheck.status !== 0) throw new Error("packed API import failed");
} finally {
	rmSync(tempDir, { recursive: true, force: true });
}
