import { spawn, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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

function waitForMcpResponse(child, id, timeoutMs = 10_000) {
	return new Promise((resolve, reject) => {
		let buffer = "";
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error(`Timed out waiting for MCP response ${id}`));
		}, timeoutMs);
		const cleanup = () => {
			clearTimeout(timer);
			child.stdout.removeListener("data", onData);
			child.removeListener("error", onError);
			child.removeListener("exit", onExit);
		};
		const onData = (chunk) => {
			buffer += chunk.toString();
			for (const line of buffer.split("\n").slice(0, -1)) {
				if (!line.trim()) continue;
				let message;
				try {
					message = JSON.parse(line);
				} catch {
					continue;
				}
				if (message?.id === id) {
					cleanup();
					resolve(message);
					return;
				}
			}
			buffer = buffer.includes("\n")
				? buffer.slice(buffer.lastIndexOf("\n") + 1)
				: buffer;
		};
		const onError = (error) => {
			cleanup();
			reject(error);
		};
		const onExit = (code, signal) => {
			cleanup();
			reject(
				new Error(`MCP process exited before response: ${code ?? signal}`),
			);
		};
		child.stdout.on("data", onData);
		child.once("error", onError);
		child.once("exit", onExit);
	});
}

async function stopChild(child) {
	if (child.exitCode !== null) return;
	const exited = new Promise((resolve) => child.once("exit", resolve));
	child.kill("SIGTERM");
	await Promise.race([
		exited,
		new Promise((resolve) =>
			setTimeout(() => {
				child.kill("SIGKILL");
				resolve();
			}, 2_000),
		),
	]);
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
	mkdirSync(installDir, { recursive: true });
	runNpm(["init", "--yes"], { cwd: installDir, stdio: "pipe" });
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
	const binaryName = process.platform === "win32" ? "hevy-mcp.cmd" : "hevy-mcp";
	const binaryPath = join(installDir, "node_modules", ".bin", binaryName);
	for (const [flag, pattern] of [
		["--help", /Usage:\s*\n\s*hevy-mcp/u],
		["--version", /^hevy-mcp v\S+/mu],
	]) {
		const cliCheck = spawnSync(binaryPath, [flag], {
			cwd: installDir,
			encoding: "utf8",
		});
		const output = `${cliCheck.stdout ?? ""}\n${cliCheck.stderr ?? ""}`;
		if (cliCheck.status !== 0 || !pattern.test(output)) {
			throw new Error(`Installed CLI failed ${flag} smoke check`);
		}
	}
	const importCheck = spawnSync(
		process.execPath,
		[
			"-e",
			"import('hevy-mcp').then(({createNodeMcpServer,runStdioServer}) => { if (typeof createNodeMcpServer !== 'function' || typeof runStdioServer !== 'function') process.exit(1); })",
		],
		{ cwd: installDir, encoding: "utf8" },
	);
	if (importCheck.status !== 0) throw new Error("packed API import failed");

	const fetchShimPath = join(tempDir, "pack-smoke-fetch.mjs");
	writeFileSync(
		fetchShimPath,
		"globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });\n",
	);
	const nodeOptions = [
		process.env.NODE_OPTIONS,
		`--import=${pathToFileURL(fetchShimPath).href}`,
	]
		.filter(Boolean)
		.join(" ");
	const child = spawn(binaryPath, [], {
		cwd: installDir,
		env: {
			...process.env,
			HEVY_API_KEY: "pack-smoke-key",
			NODE_OPTIONS: nodeOptions,
		},
		stdio: ["pipe", "pipe", "pipe"],
	});
	child.stderr.resume();
	try {
		child.stdin.write(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-11-25",
					capabilities: {},
					clientInfo: { name: "pack-smoke", version: "1.0.0" },
				},
			})}\n`,
		);
		const initialize = await waitForMcpResponse(child, 1);
		if (typeof initialize.result?.protocolVersion !== "string") {
			throw new Error("Installed CLI MCP initialize handshake failed");
		}
		child.stdin.write(
			`${JSON.stringify({
				jsonrpc: "2.0",
				method: "notifications/initialized",
			})}\n`,
		);
		child.stdin.write(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
				params: {},
			})}\n`,
		);
		const toolsList = await waitForMcpResponse(child, 2);
		if (!Array.isArray(toolsList.result?.tools)) {
			throw new Error("Installed CLI MCP tools/list handshake failed");
		}
	} finally {
		await stopChild(child);
	}
} finally {
	rmSync(tempDir, { recursive: true, force: true });
}
