import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const workerEntries = ["packages/worker/src/worker.ts"];
const nodeBuiltins = new Set([
	"assert",
	"buffer",
	"child_process",
	"cluster",
	"console",
	"constants",
	"crypto",
	"dgram",
	"diagnostics_channel",
	"dns",
	"domain",
	"events",
	"fs",
	"http",
	"http2",
	"https",
	"module",
	"net",
	"os",
	"path",
	"perf_hooks",
	"process",
	"punycode",
	"querystring",
	"readline",
	"repl",
	"stream",
	"string_decoder",
	"sys",
	"timers",
	"tls",
	"trace_events",
	"tty",
	"url",
	"util",
	"v8",
	"vm",
	"wasi",
	"worker_threads",
	"zlib",
]);
const forbiddenSourceFiles = new Set([
	"packages/node/src/cli.ts",
	"packages/node/src/index.ts",
	"packages/node/src/utils/hevy-client-observability.ts",
	"packages/node/src/utils/metrics.ts",
	"packages/node/src/utils/mcp-session-observability.ts",
	"packages/node/src/utils/observability-wrapper.ts",
	"packages/node/src/utils/stdio-observability.ts",
	"packages/node/src/utils/telemetry-wrapper.ts",
	"packages/node/src/utils/telemetry.ts",
]);
const forbiddenPackages = [
	"@sentry/node",
	"@sentry/opentelemetry",
	"@opentelemetry/sdk-metrics",
	"@opentelemetry/sdk-trace-node",
];

function sourcePath(relativePath) {
	return path.join(root, relativePath);
}

function resolveRelativeImport(fromFile, specifier) {
	const base = path.resolve(path.dirname(fromFile), specifier);
	const candidates = [base];
	if (base.endsWith(".js")) candidates.push(`${base.slice(0, -3)}.ts`);
	else candidates.push(`${base}.ts`);
	candidates.push(path.join(base, "index.ts"));
	return candidates.find((candidate) => {
		try {
			return fs.statSync(candidate).isFile();
		} catch {
			return false;
		}
	});
}

function importedSpecifiers(source) {
	const specifiers = new Set();
	const patterns = [
		/\b(?:import|export)\s+(?:type\s+)?[^;]*?\sfrom\s*["']([^"']+)["']/g,
		/\b(?:import|export)\s*["']([^"']+)["']/g,
		/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
	];
	for (const pattern of patterns) {
		for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
	}
	return specifiers;
}

function isNodeBuiltin(specifier) {
	return specifier.startsWith("node:") || nodeBuiltins.has(specifier);
}

function formatChain(chain) {
	return chain.map((file) => path.relative(root, file)).join(" -> ");
}

const pending = workerEntries.map((entry) => ({
	file: sourcePath(entry),
	chain: [sourcePath(entry)],
}));
const visited = new Set();
const violations = [];

while (pending.length > 0) {
	const current = pending.pop();
	if (visited.has(current.file)) continue;
	visited.add(current.file);

	const relativeFile = path.relative(root, current.file);
	if (forbiddenSourceFiles.has(relativeFile)) {
		violations.push(
			`${formatChain(current.chain)} imports Node-only source ${relativeFile}`,
		);
		continue;
	}

	const source = fs.readFileSync(current.file, "utf8");
	for (const specifier of importedSpecifiers(source)) {
		if (isNodeBuiltin(specifier)) {
			violations.push(
				`${formatChain(current.chain)} imports Node builtin ${specifier}`,
			);
			continue;
		}
		if (forbiddenPackages.some((name) => specifier === name)) {
			violations.push(
				`${formatChain(current.chain)} imports Node-only package ${specifier}`,
			);
			continue;
		}
		if (!specifier.startsWith(".")) continue;
		const resolved = resolveRelativeImport(current.file, specifier);
		if (resolved)
			pending.push({ file: resolved, chain: [...current.chain, resolved] });
	}
}

if (violations.length > 0) {
	console.error("Worker import boundary violations:");
	for (const violation of violations) console.error(`- ${violation}`);
	process.exitCode = 1;
} else {
	console.log(`Worker import boundary passed (${visited.size} source files).`);
}
