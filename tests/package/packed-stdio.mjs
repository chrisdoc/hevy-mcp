import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import {
	access,
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
} from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
	DEFAULT_INHERITED_ENV_VARS,
	StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";

const execFileAsync = promisify(execFile);
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const networkGuardPath = join(sourceRoot, "tests/package/network-guard.mjs");
const networkGuardProbePath = join(
	sourceRoot,
	"tests/package/network-guard-probe.mjs",
);
const denialMarkerPrefix = "HEVY_MCP_PACKED_STDIO_GUARD_DENIAL_V1 ";
const fixtureApiKey = "fixture-only-api-key";
const closeTimeoutMs = 5_000;
const signalTimeoutMs = 2_000;

function assertPathInside(path, parent, label) {
	const childRelative = relative(parent, path);
	assert.ok(
		childRelative &&
			!childRelative.startsWith("..") &&
			!isAbsolute(childRelative),
		`${label} must be inside ${parent}; got ${path}`,
	);
}

function assertPathOutside(path, parent, label) {
	const childRelative = relative(parent, path);
	assert.ok(
		childRelative.startsWith("..") || isAbsolute(childRelative),
		`${label} must be outside ${parent}; got ${path}`,
	);
}

function parseJsonOutput(stdout, label) {
	try {
		return JSON.parse(stdout);
	} catch (error) {
		throw new Error(`${label} did not return JSON: ${error.message}`);
	}
}

function parseNpmPackOutput(stdout) {
	const candidates = [0];
	for (
		let index = stdout.indexOf("\n[");
		index !== -1;
		index = stdout.indexOf("\n[", index + 2)
	) {
		candidates.push(index + 1);
	}

	for (const index of candidates.reverse()) {
		try {
			const parsed = JSON.parse(stdout.slice(index));
			if (Array.isArray(parsed)) {
				return parsed;
			}
		} catch {
			// npm lifecycle output can precede the final JSON metadata.
		}
	}

	throw new Error("npm pack --json did not emit parseable metadata");
}

function getPrivateChildProcess(transport) {
	// Pinned to @modelcontextprotocol/sdk 1.29.0. This is the only adapter that
	// reaches into StdioClientTransport's private process field. Fail closed if
	// the SDK changes instead of silently losing raw stdout auditing.
	const child = transport._process;
	if (
		!child ||
		typeof child.pid !== "number" ||
		!child.stdout ||
		typeof child.stdout.on !== "function"
	) {
		throw new Error(
			"SDK 1.29.0 stdio private process/stdout assumption is unavailable",
		);
	}
	return child;
}

class AuditedStdioClientTransport extends StdioClientTransport {
	rawStdoutChunks = [];
	childProcess = undefined;
	/** @type {Promise<{ code: number | null, signal: string | null }> | undefined} */
	childExit = undefined;
	onChildStarted = undefined;

	start() {
		const started = super.start();
		const child = getPrivateChildProcess(this);
		this.childProcess = child;
		this.childExit = new Promise((resolveExit) => {
			child.once("close", (code, signal) => resolveExit({ code, signal }));
		});
		child.stdout.on("data", (chunk) => {
			this.rawStdoutChunks.push(Buffer.from(chunk));
		});
		const childStarted = this.onChildStarted?.(child);
		return Promise.all([started, childStarted]).then(() => undefined);
	}
}

function readTextContent(result) {
	const first = result.content?.[0];
	assert.equal(
		first?.type,
		"text",
		"expected first MCP content item to be text",
	);
	return first.text;
}

function readProcessTable() {
	const output = execFileSync("ps", ["-eo", "pid=,ppid=,pgid=,sid=,comm="], {
		encoding: "utf8",
	});
	return output
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [pid, ppid, pgid, sid, ...command] = line.trim().split(/\s+/);
			return {
				pid: Number(pid),
				ppid: Number(ppid),
				pgid: Number(pgid),
				sid: Number(sid),
				command: command.join(" "),
			};
		});
}

function processIdentity(pid) {
	return readProcessTable().find((entry) => entry.pid === pid);
}

function processGroupMembers(processGroupId) {
	return readProcessTable().filter((entry) => entry.pgid === processGroupId);
}

function assertSafeProcessGroupTarget(processGroupId) {
	assert.ok(
		Number.isInteger(processGroupId) && processGroupId > 1,
		`invalid MCP process-group target ${processGroupId}`,
	);
	const parentIdentity = processIdentity(process.pid);
	assert.ok(parentIdentity, "could not read the parent process identity");
	assert.notEqual(
		processGroupId,
		parentIdentity.pgid,
		"refusing to target the parent process group",
	);
}

function containedProcessGroupMembers(processGroupId) {
	assertSafeProcessGroupTarget(processGroupId);
	const members = processGroupMembers(processGroupId);
	for (const member of members) {
		assert.equal(
			member.sid,
			processGroupId,
			`process group ${processGroupId} contains PID ${member.pid} from session ${member.sid}`,
		);
	}
	return members;
}

async function resolveLinuxSetsid() {
	if (process.platform !== "linux") {
		return undefined;
	}

	const setsidPath = "/usr/bin/setsid";
	try {
		await access(setsidPath);
	} catch (error) {
		throw new Error(`Linux process containment requires ${setsidPath}`, {
			cause: error,
		});
	}
	return setsidPath;
}

async function verifyDedicatedProcessGroup(pid) {
	await waitFor(
		() => {
			const identity = processIdentity(pid);
			return identity?.pgid === pid && identity.sid === pid;
		},
		signalTimeoutMs,
		`PID ${pid} to become its process-group and session leader`,
	);
	const identity = processIdentity(pid);
	assert.ok(identity, `MCP child PID ${pid} disappeared during containment`);
	assert.equal(
		identity.pgid,
		pid,
		"setsid child is not its process-group leader",
	);
	assert.equal(identity.sid, pid, "setsid child is not its session leader");
}

function signalProcessGroup(processGroupId, signal) {
	assertSafeProcessGroupTarget(processGroupId);
	try {
		process.kill(-processGroupId, signal);
	} catch (error) {
		if (error?.code !== "ESRCH") {
			throw error;
		}
	}
}

async function emptyProcessGroup(processGroupId) {
	const members = containedProcessGroupMembers(processGroupId);
	if (members.length === 0) {
		return;
	}

	const summary = members
		.map(({ pid, ppid, command }) => `${pid}(ppid=${ppid},${command})`)
		.join(", ");
	const leakError = new Error(
		`MCP process group ${processGroupId} remained after SDK close: ${summary}`,
	);

	signalProcessGroup(processGroupId, "SIGTERM");
	try {
		await waitFor(
			() => containedProcessGroupMembers(processGroupId).length === 0,
			signalTimeoutMs,
			`process group ${processGroupId} to exit after SIGTERM`,
		);
	} catch {
		signalProcessGroup(processGroupId, "SIGKILL");
		await waitFor(
			() => containedProcessGroupMembers(processGroupId).length === 0,
			signalTimeoutMs,
			`process group ${processGroupId} to exit after SIGKILL`,
		);
	}

	assert.deepEqual(
		containedProcessGroupMembers(processGroupId),
		[],
		`MCP process group ${processGroupId} was not emptied`,
	);
	throw leakError;
}

function directChildren(pid) {
	if (process.platform === "linux") {
		try {
			const contents = readFileSync(
				`/proc/${pid}/task/${pid}/children`,
				"utf8",
			);
			return contents.trim().split(/\s+/).filter(Boolean).map(Number);
		} catch {
			return [];
		}
	}

	try {
		const output = execFileSync("ps", ["-eo", "pid=,ppid="], {
			encoding: "utf8",
		});
		return output
			.trim()
			.split("\n")
			.map((line) => line.trim().split(/\s+/).map(Number))
			.filter(([, parentPid]) => parentPid === pid)
			.map(([childPid]) => childPid);
	} catch {
		return [];
	}
}

function collectDescendants(pid, found = new Set()) {
	for (const childPid of directChildren(pid)) {
		if (!found.has(childPid)) {
			found.add(childPid);
			collectDescendants(childPid, found);
		}
	}
	return found;
}

async function waitFor(condition, timeoutMs, label) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await condition()) {
			return;
		}
		await new Promise((resolveWait) => setTimeout(resolveWait, 25));
	}
	throw new Error(`Timed out waiting for ${label}`);
}

async function closeWithTimeout(close, label) {
	let timeout;
	try {
		await Promise.race([
			close(),
			new Promise((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error(`${label} timed out`)),
					closeTimeoutMs,
				);
				timeout.unref();
			}),
		]);
	} finally {
		clearTimeout(timeout);
	}
}

function auditRawStdout(chunks) {
	const raw = Buffer.concat(chunks).toString("utf8");
	assert.ok(raw.length > 0, "MCP child produced no stdout messages");
	assert.ok(raw.endsWith("\n"), "MCP stdout ended with trailing non-LF bytes");
	const lines = raw.slice(0, -1).split("\n");
	for (const [index, line] of lines.entries()) {
		assert.ok(line.length > 0, `MCP stdout line ${index + 1} was empty`);
		let parsed;
		try {
			parsed = JSON.parse(line);
		} catch (error) {
			throw new Error(
				`MCP stdout line ${index + 1} was not JSON: ${error.message}`,
			);
		}
		const validated = JSONRPCMessageSchema.safeParse(parsed);
		assert.ok(
			validated.success,
			`MCP stdout line ${index + 1} was not a JSON-RPC message`,
		);
	}
	return raw;
}

function parseGuardDenials(stderr, label) {
	const denials = [];
	for (const line of stderr.split("\n")) {
		if (!line.startsWith(denialMarkerPrefix)) {
			continue;
		}
		let denial;
		try {
			denial = JSON.parse(line.slice(denialMarkerPrefix.length));
		} catch (error) {
			throw new Error(`${label} emitted a malformed guard denial marker`, {
				cause: error,
			});
		}
		assert.deepEqual(
			Object.keys(denial).sort(),
			["api", "kind"],
			`${label} guard marker exposed unexpected fields`,
		);
		assert.equal(typeof denial.kind, "string");
		assert.equal(typeof denial.api, "string");
		denials.push(denial);
	}
	return denials;
}

function assertNoGuardDenials(stderr, label) {
	assert.deepEqual(
		parseGuardDenials(stderr, label),
		[],
		`${label} triggered a package isolation denial`,
	);
}

function createFixture() {
	const expected = new Map([
		["GET /v1/user/info", 0],
		["GET /v1/workouts/count", 0],
		["GET /v1/workouts/missing-workout", 0],
	]);
	const unexpected = [];

	const server = createServer((request, response) => {
		const route = `${request.method} ${request.url}`;
		if (request.headers["api-key"] !== fixtureApiKey) {
			unexpected.push(`${route} used an invalid fixture API key`);
			response.writeHead(401, { "content-type": "application/json" });
			response.end(JSON.stringify({ error: "unauthorized" }));
			return;
		}

		if (!expected.has(route)) {
			unexpected.push(route);
			response.writeHead(500, { "content-type": "application/json" });
			response.end(JSON.stringify({ error: "unexpected fixture request" }));
			return;
		}

		expected.set(route, expected.get(route) + 1);
		response.setHeader("content-type", "application/json");
		if (route === "GET /v1/user/info") {
			response.end(JSON.stringify({ id: "fixture-user" }));
			return;
		}
		if (route === "GET /v1/workouts/count") {
			response.end(JSON.stringify({ workout_count: 42 }));
			return;
		}

		response.writeHead(404);
		response.end(JSON.stringify({ error: "workout not found" }));
	});

	return { server, expected, unexpected };
}

async function listenFixture(server) {
	await new Promise((resolveListen, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolveListen);
	});
	const address = server.address();
	assert.ok(address && typeof address === "object");
	return `http://127.0.0.1:${address.port}`;
}

async function closeFixture(server) {
	if (!server.listening) {
		return;
	}
	await new Promise((resolveClose, reject) => {
		server.close((error) => (error ? reject(error) : resolveClose()));
	});
}

function sanitizedEnv({ home, cache, fixtureUrl, readRoots }) {
	const fixtureOrigin = new URL(fixtureUrl);
	assert.equal(fixtureOrigin.protocol, "http:");
	assert.ok(
		fixtureOrigin.hostname === "127.0.0.1" || fixtureOrigin.hostname === "::1",
		"fixture must use an exact numeric loopback host",
	);
	assert.match(fixtureOrigin.port, /^[1-9]\d*$/, "fixture port is required");

	const env = {
		PATH: process.env.PATH ?? "",
		HOME: home,
		TMPDIR: dirname(home),
		TMP: dirname(home),
		TEMP: dirname(home),
		XDG_CACHE_HOME: cache,
		HEVY_API_KEY: fixtureApiKey,
		NODE_ENV: "test",
		HEVY_MCP_TEST_API_BASE_URL: fixtureUrl,
		HEVY_MCP_TEST_DISABLE_UPDATE_CHECK: "1",
		HEVY_MCP_TEST_ALLOWED_HOST: fixtureOrigin.hostname,
		HEVY_MCP_TEST_ALLOWED_PORT: fixtureOrigin.port,
		SENTRY_DSN: "*",
		NODE_OPTIONS: [
			"--permission",
			...readRoots.map((readRoot) => `--allow-fs-read=${readRoot}`),
			`--allow-fs-read=${networkGuardPath}`,
			`--import=${pathToFileURL(networkGuardPath).href}`,
		].join(" "),
	};
	for (const name of DEFAULT_INHERITED_ENV_VARS) {
		env[name] ??= "";
	}
	return env;
}

function assertSanitizedEnv(env) {
	assert.equal(env.HEVY_API_KEY, fixtureApiKey);
	assert.ok(env.NODE_OPTIONS.includes("--permission"));
	assert.ok(!env.NODE_OPTIONS.includes("--allow-child-process"));
	assert.ok(!env.NODE_OPTIONS.includes("--allow-worker"));
	assert.ok(!env.NODE_OPTIONS.includes("--allow-addons"));
	assert.ok(!env.NODE_OPTIONS.includes("--allow-wasi"));
	assert.ok(!env.NODE_OPTIONS.includes("--allow-fs-write"));

	const childValues = new Set(Object.values(env));
	for (const [name, value] of Object.entries(process.env)) {
		if (
			value &&
			/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i.test(name) &&
			name !== "HEVY_API_KEY"
		) {
			assert.ok(
				!childValues.has(value),
				`child environment inherited sensitive value from ${name}`,
			);
		}
	}
}

async function runNetworkGuardProbe(env) {
	const result = await execFileAsync(
		process.execPath,
		[networkGuardProbePath],
		{
			env,
			maxBuffer: 1024 * 1024,
		},
	);
	const expectedApis = [
		"fetch",
		"http.request",
		"https.request",
		"net.connect",
		"tls.connect",
		"child_process.spawn",
		"worker_threads.Worker",
		"dgram.createSocket",
		"http2.connect",
		"dns.lookup",
		"dns.promises.lookup",
		"dns.promises.lookupService",
		"dns.Resolver.resolve4",
		"dns.promises.Resolver.resolve4",
	];
	assert.deepEqual(
		parseJsonOutput(result.stdout, "network guard probe"),
		expectedApis,
	);
	assert.deepEqual(
		parseGuardDenials(result.stderr, "network guard probe").map(
			({ api }) => api,
		),
		expectedApis,
		"caught guard denials were erasable or incomplete",
	);
}

async function inspectInstalledExports(mainPath, env) {
	const script = [
		`const module = await import(${JSON.stringify(pathToFileURL(mainPath).href)});`,
		"process.stdout.write(JSON.stringify(Object.keys(module).sort()));",
	].join("\n");
	const result = await execFileAsync(
		process.execPath,
		["--input-type=module", "-e", script],
		{
			env,
			maxBuffer: 1024 * 1024,
		},
	);
	assert.equal(
		result.stderr,
		"Invalid Sentry Dsn: *\n",
		"importing installed main module wrote unexpected stderr",
	);
	return parseJsonOutput(result.stdout, "installed module export inspection");
}

async function run() {
	const temporaryRoot = await mkdtemp(join(tmpdir(), "hevy-mcp-packed-stdio-"));
	const packDirectory = join(temporaryRoot, "pack");
	const consumerDirectory = join(temporaryRoot, "consumer");
	const isolatedHome = join(temporaryRoot, "home");
	const isolatedCache = join(temporaryRoot, "cache");
	const { server: fixture, expected, unexpected } = createFixture();
	let client;
	let transport;
	let childPid;
	let processGroupId;
	let processGroupMonitor;
	/** @type {Promise<void> | undefined} */
	let processGroupVerification;
	let processGroupVerified = false;
	let transportClosed = false;
	let monitorError;
	let stderr = "";
	const observedDescendants = new Set();
	const observedProcessGroupMembers = new Set();
	let primaryError;
	const cleanupErrors = [];

	try {
		await Promise.all([
			mkdir(packDirectory),
			mkdir(consumerDirectory),
			mkdir(isolatedHome),
			mkdir(isolatedCache),
		]);

		const sourcePackage = parseJsonOutput(
			await readFile(join(sourceRoot, "package.json"), "utf8"),
			"source package.json",
		);
		const packageManagerEnv = {
			PATH: process.env.PATH ?? "",
			HOME: isolatedHome,
			TMPDIR: temporaryRoot,
			TMP: temporaryRoot,
			TEMP: temporaryRoot,
			XDG_CACHE_HOME: isolatedCache,
			npm_config_cache: isolatedCache,
			ROLLUP_SKIP_NODEJS_NATIVE_BUILD: "true",
		};
		const packResult = await execFileAsync(
			"npm",
			["pack", "--json", "--silent", "--pack-destination", packDirectory],
			{
				cwd: sourceRoot,
				env: packageManagerEnv,
				maxBuffer: 20 * 1024 * 1024,
			},
		);
		const packMetadata = parseNpmPackOutput(packResult.stdout);
		assert.equal(packMetadata.length, 1, "npm pack emitted one tarball");
		const packed = packMetadata[0];
		assert.equal(packed.name, sourcePackage.name);
		assert.equal(packed.version, sourcePackage.version);
		const tarballPath = join(packDirectory, packed.filename);
		assertPathInside(tarballPath, temporaryRoot, "packed tarball");
		assertPathOutside(tarballPath, sourceRoot, "packed tarball");

		const packedFiles = new Set(packed.files.map(({ path }) => path));
		for (const required of [
			"package.json",
			"server.json",
			"README.md",
			"dist/cli.mjs",
			"dist/index.mjs",
			"dist/index.d.mts",
		]) {
			assert.ok(
				packedFiles.has(required),
				`tarball metadata omitted ${required}`,
			);
		}
		for (const path of packedFiles) {
			assert.ok(
				!path.startsWith("src/"),
				`tarball included source file ${path}`,
			);
			assert.ok(
				!path.startsWith("tests/"),
				`tarball included test file ${path}`,
			);
			assert.ok(
				!path.startsWith(".git"),
				`tarball included Git metadata ${path}`,
			);
			assert.ok(
				!basename(path).startsWith(".env"),
				`tarball included env file ${path}`,
			);
			assert.ok(
				!/secret|credential|private/i.test(path),
				`tarball included private artifact ${path}`,
			);
		}

		const tarEntries = (
			await execFileAsync("tar", ["-tzf", tarballPath], {
				maxBuffer: 20 * 1024 * 1024,
			})
		).stdout
			.trim()
			.split("\n");
		for (const required of [
			"package/package.json",
			"package/server.json",
			"package/README.md",
			"package/dist/cli.mjs",
			"package/dist/index.mjs",
			"package/dist/index.d.mts",
		]) {
			assert.ok(tarEntries.includes(required), `tarball omitted ${required}`);
		}

		await execFileAsync(
			"npm",
			[
				"install",
				"--ignore-scripts",
				"--no-audit",
				"--no-fund",
				"--package-lock=false",
				tarballPath,
			],
			{
				cwd: consumerDirectory,
				env: packageManagerEnv,
				maxBuffer: 20 * 1024 * 1024,
			},
		);

		const installedPackageRoot = await realpath(
			join(consumerDirectory, "node_modules", sourcePackage.name),
		);
		const executableLink = join(
			consumerDirectory,
			"node_modules/.bin/hevy-mcp",
		);
		const executablePath = await realpath(executableLink);
		assertPathInside(
			installedPackageRoot,
			consumerDirectory,
			"installed package",
		);
		assertPathOutside(installedPackageRoot, sourceRoot, "installed package");
		assertPathInside(executablePath, consumerDirectory, "installed executable");
		assertPathOutside(executablePath, sourceRoot, "installed executable");

		const installedPackage = parseJsonOutput(
			await readFile(join(installedPackageRoot, "package.json"), "utf8"),
			"installed package.json",
		);
		assert.equal(installedPackage.name, sourcePackage.name);
		assert.equal(installedPackage.version, sourcePackage.version);
		assert.deepEqual(installedPackage.bin, { "hevy-mcp": "dist/cli.mjs" });
		assert.equal(installedPackage.main, "dist/index.mjs");
		assert.equal(installedPackage.types, "dist/index.d.mts");
		assert.ok(
			!("exports" in installedPackage),
			"current package contract has no exports field",
		);
		for (const target of [
			installedPackage.bin["hevy-mcp"],
			installedPackage.main,
			installedPackage.types,
		]) {
			await readFile(join(installedPackageRoot, target));
		}

		const installedManifest = parseJsonOutput(
			await readFile(join(installedPackageRoot, "server.json"), "utf8"),
			"installed server.json",
		);
		assert.equal(installedManifest.name, sourcePackage.mcpName);
		assert.equal(installedManifest.version, installedPackage.version);
		assert.equal(installedManifest.packages.length, 1);
		assert.equal(
			installedManifest.packages[0].identifier,
			installedPackage.name,
		);
		assert.equal(
			installedManifest.packages[0].version,
			installedPackage.version,
		);
		assert.deepEqual(installedManifest.packages[0].transport, {
			type: "stdio",
		});

		const cliContents = await readFile(executablePath, "utf8");
		assert.ok(
			cliContents.startsWith("#!/usr/bin/env node\n"),
			"CLI shebang missing",
		);
		await chmod(executablePath, 0o755);

		const fixtureUrl = await listenFixture(fixture);
		const probeEnv = sanitizedEnv({
			home: isolatedHome,
			cache: isolatedCache,
			fixtureUrl,
			readRoots: [sourceRoot],
		});
		assertSanitizedEnv(probeEnv);
		await runNetworkGuardProbe(probeEnv);
		const childEnv = sanitizedEnv({
			home: isolatedHome,
			cache: isolatedCache,
			fixtureUrl,
			readRoots: [consumerDirectory],
		});
		assertSanitizedEnv(childEnv);
		const exportedSurface = await inspectInstalledExports(
			join(installedPackageRoot, installedPackage.main),
			childEnv,
		);
		assert.deepEqual(exportedSurface, [
			"configSchema",
			"createServer",
			"default",
			"runServer",
		]);

		const setsidPath = await resolveLinuxSetsid();
		transport = new AuditedStdioClientTransport({
			command: setsidPath ?? executableLink,
			args: setsidPath ? [executableLink] : [],
			env: childEnv,
			cwd: consumerDirectory,
			stderr: "pipe",
		});
		transport.onChildStarted = (child) => {
			childPid = child.pid;
			if (process.platform === "linux") {
				processGroupId = child.pid;
				const monitorContainedProcesses = () => {
					try {
						for (const member of processGroupMembers(processGroupId)) {
							observedProcessGroupMembers.add(member.pid);
						}
						for (const pid of collectDescendants(child.pid)) {
							observedDescendants.add(pid);
						}
					} catch (error) {
						monitorError ??= error;
					}
				};
				monitorContainedProcesses();
				processGroupMonitor = setInterval(monitorContainedProcesses, 20);
				processGroupMonitor.unref();
				processGroupVerification = verifyDedicatedProcessGroup(child.pid).then(
					() => {
						processGroupVerified = true;
						for (const member of processGroupMembers(processGroupId)) {
							observedProcessGroupMembers.add(member.pid);
						}
					},
				);
				return processGroupVerification;
			}

			processGroupMonitor = setInterval(() => {
				for (const pid of collectDescendants(child.pid)) {
					observedDescendants.add(pid);
				}
			}, 20);
			processGroupMonitor.unref();
			return undefined;
		};
		transport.stderr.on("data", (chunk) => {
			stderr += chunk.toString("utf8");
		});
		client = new Client(
			{ name: "hevy-mcp-packed-stdio-test", version: "1.0.0" },
			{ capabilities: {} },
		);
		await client.connect(transport);
		assert.equal(childPid, transport.childProcess.pid);
		if (process.platform === "linux") {
			assert.ok(processGroupVerification);
			await processGroupVerification;
			assert.equal(processGroupVerified, true);
			assert.equal(monitorError, undefined);
			assert.ok(
				observedProcessGroupMembers.has(childPid),
				"process-group monitoring did not observe the MCP child",
			);
		}

		const serverVersion = client.getServerVersion();
		assert.equal(serverVersion?.name, installedPackage.name);
		assert.equal(serverVersion?.version, installedPackage.version);
		const tools = await client.listTools();
		assert.ok(
			tools.tools.some(({ name }) => name === "get-workout-count"),
			"installed package did not advertise get-workout-count",
		);

		const countResult = await client.callTool({
			name: "get-workout-count",
			arguments: {},
		});
		assert.notEqual(
			countResult.isError,
			true,
			`get-workout-count failed: ${readTextContent(countResult)}\nstderr:\n${stderr}`,
		);
		assert.deepEqual(JSON.parse(readTextContent(countResult)), { count: 42 });
		assert.deepEqual(countResult.structuredContent, { count: 42 });

		const missingResult = await client.callTool({
			name: "get-workout",
			arguments: { workoutId: "missing-workout" },
		});
		assert.equal(missingResult.isError, true);
		assert.match(readTextContent(missingResult), /not found/i);

		await closeWithTimeout(() => client.close(), "MCP client close");
		client = undefined;
		transportClosed = true;
		const childExit = transport.childExit;
		assert.ok(childExit, "MCP child exit promise was not initialized");
		const exit = await childExit;
		assert.equal(
			exit.signal,
			null,
			`MCP child exited via signal ${exit.signal}`,
		);
		assert.equal(exit.code, 0, `MCP child exited with code ${exit.code}`);
		if (processGroupId) {
			await emptyProcessGroup(processGroupId);
		}

		const rawStdout = auditRawStdout(transport.rawStdoutChunks);
		assert.ok(
			!rawStdout.includes(fixtureApiKey),
			"fixture key appeared on stdout",
		);
		assert.ok(
			!stderr.includes(fixtureApiKey),
			"fixture key appeared on stderr",
		);
		assertNoGuardDenials(stderr, "installed MCP package");
		assert.deepEqual(unexpected, [], "fixture received unexpected requests");
		for (const [route, count] of expected) {
			assert.equal(count, 1, `${route} was requested ${count} times`);
		}
	} catch (error) {
		primaryError = error;
	} finally {
		if (client) {
			try {
				await closeWithTimeout(() => client.close(), "MCP client cleanup");
				transportClosed = true;
			} catch (error) {
				cleanupErrors.push(error);
			}
		}
		if (transport && !transportClosed) {
			try {
				await closeWithTimeout(
					() => transport.close(),
					"stdio transport cleanup",
				);
				transportClosed = true;
			} catch (error) {
				cleanupErrors.push(error);
			}
		}

		if (processGroupMonitor) {
			clearInterval(processGroupMonitor);
		}
		if (monitorError) {
			cleanupErrors.push(
				new Error("process-group monitoring failed", { cause: monitorError }),
			);
		}

		if (process.platform === "linux" && processGroupId) {
			try {
				assert.ok(processGroupVerification);
				await processGroupVerification;
			} catch (error) {
				cleanupErrors.push(error);
			}
			try {
				await emptyProcessGroup(processGroupId);
			} catch (error) {
				cleanupErrors.push(error);
			}
		}
		if (observedDescendants.size > 0) {
			cleanupErrors.push(
				new Error(
					`MCP child created forbidden descendants: ${[...observedDescendants].join(", ")}`,
				),
			);
		}
		try {
			assert.ok(
				!stderr.includes(fixtureApiKey),
				"fixture key appeared on captured stderr",
			);
			assertNoGuardDenials(stderr, "installed MCP package");
		} catch (error) {
			cleanupErrors.push(error);
		}
		try {
			await closeFixture(fixture);
		} catch (error) {
			cleanupErrors.push(error);
		}
		try {
			await rm(temporaryRoot, { recursive: true, force: true });
		} catch (error) {
			cleanupErrors.push(error);
		}
	}

	if (primaryError || cleanupErrors.length > 0) {
		throw new AggregateError(
			[...(primaryError ? [primaryError] : []), ...cleanupErrors],
			"Packed stdio boundary test failed",
		);
	}
}

run()
	.then(() => {
		console.log("Packed package stdio boundary passed.");
	})
	.catch((error) => {
		console.error(error?.stack ?? error);
		if (error instanceof AggregateError) {
			for (const [index, cause] of error.errors.entries()) {
				console.error(`Cause ${index + 1}:`, cause?.stack ?? cause);
			}
		}
		process.exitCode = 1;
	});
