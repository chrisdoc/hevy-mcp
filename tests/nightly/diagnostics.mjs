import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const RESULT_CATEGORIES = Object.freeze([
	"launcher",
	"handshake",
	"inventory",
	"schema",
	"pagination",
	"consistency",
	"resilience",
	"lifecycle",
]);

export const ERROR_CLASSES = Object.freeze([
	"axios",
	"mcp",
	"schema",
	"assertion",
	"transport",
	"unknown",
]);

const RESULT_DEFINITIONS = new Map([
	["configuration", "launcher"],
	["setup-or-handshake", "handshake"],
	["server-info", "handshake"],
	["tools-registered", "inventory"],
	["get-workouts-shape", "schema"],
	["get-workout-count-shape", "schema"],
	["get-workout-events-shape", "schema"],
	["get-routines-shape", "schema"],
	["get-exercise-templates-shape", "schema"],
	["search-exercise-templates-shape", "schema"],
	["get-routine-folders-shape", "schema"],
	["get-body-measurements-shape", "schema"],
	["get-user-info-shape", "schema"],
	["pagination-pageSize-2-respected", "pagination"],
	["pagination-pageSize-5-respected", "pagination"],
	["rejects-out-of-range-pageSize", "resilience"],
	["workout-count-matches-pagination", "consistency"],
	["get-workout-handles-unknown-id", "resilience"],
	["client-close", "lifecycle"],
]);

const TRANSPORT_CODES = new Set([
	"EACCES",
	"ECONNREFUSED",
	"ECONNRESET",
	"EPIPE",
	"ENOENT",
	"ETIMEDOUT",
]);
const MAX_STDERR_BYTES = 65_536;
const SAFE_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/;
const SAFE_SCHEMA_PATHS = new Set([
	"$",
	"$[0]",
	"$[0].id",
	"$[0].title",
	"$.content[0]",
	"$.content[0].text",
	"$.content[0].type",
	"$.count",
	"$.id",
	"$.isError",
	"$.response",
	"$.server.name",
	"$.server.version",
	"$.tools",
]);
const SAFE_LAUNCHERS = new Set(["npx", "bunx", "source", "release-source"]);
const SAFE_PLATFORMS = new Set([
	"aix",
	"darwin",
	"freebsd",
	"linux",
	"openbsd",
	"sunos",
	"win32",
]);
const SAFE_ARCHES = new Set([
	"arm",
	"arm64",
	"ia32",
	"loong64",
	"mips",
	"mipsel",
	"ppc",
	"ppc64",
	"riscv64",
	"s390",
	"s390x",
	"x64",
]);

function safeRead(value, key) {
	try {
		return value && typeof value === "object" ? value[key] : undefined;
	} catch {
		return undefined;
	}
}

function safeVersion(value) {
	return typeof value === "string" && SAFE_VERSION.test(value) ? value : null;
}

function safeRevision(value) {
	return typeof value === "string" && /^[a-f0-9]{7,64}$/i.test(value)
		? value
		: null;
}

function safeSchemaPath(value) {
	return SAFE_SCHEMA_PATHS.has(value) ? value : null;
}

export function createDiagnosticError(kind, schemaPath) {
	const error = new Error("nightly diagnostic failure");
	error.diagnosticKind = ERROR_CLASSES.includes(kind) ? kind : "unknown";
	error.schemaPath = safeSchemaPath(schemaPath);
	return error;
}

export function normalizeError(error, suppliedSchemaPath) {
	const explicitKind = safeRead(error, "diagnosticKind");
	const name = safeRead(error, "name");
	const code = safeRead(error, "code");
	let errorClass = "unknown";

	if (ERROR_CLASSES.includes(explicitKind)) errorClass = explicitKind;
	else if (safeRead(error, "isAxiosError") === true || name === "AxiosError") {
		errorClass = "axios";
	} else if (
		typeof code === "number" ||
		name === "McpError" ||
		name === "JSONRPCError"
	) {
		errorClass = "mcp";
	} else if (name === "AssertionError") errorClass = "assertion";
	else if (typeof code === "string" && TRANSPORT_CODES.has(code)) {
		errorClass = "transport";
	}

	return {
		errorClass,
		schemaPath:
			safeSchemaPath(suppliedSchemaPath) ??
			safeSchemaPath(safeRead(error, "schemaPath")),
	};
}

export function createDiagnostics({
	launcher,
	packageVersion,
	serverVersion,
	sourceRevision,
	runtime = {},
}) {
	const safeLauncher = SAFE_LAUNCHERS.has(launcher) ? launcher : "unknown";
	return {
		schemaVersion: 1,
		launcher: safeLauncher,
		versions: {
			package: safeVersion(packageVersion),
			server: safeVersion(serverVersion),
			sourceRevision: ["source", "release-source"].includes(safeLauncher)
				? safeRevision(sourceRevision)
				: null,
		},
		runtime: {
			node:
				typeof runtime.node === "string" &&
				/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(runtime.node)
					? runtime.node
					: null,
			platform: SAFE_PLATFORMS.has(runtime.platform) ? runtime.platform : null,
			arch: SAFE_ARCHES.has(runtime.arch) ? runtime.arch : null,
		},
		stderr: { observed: false, byteCount: 0, truncated: false },
		results: [],
		totals: { passed: 0, failed: 0, total: 0 },
	};
}

export function setVersions(summary, { packageVersion, serverVersion }) {
	if (packageVersion !== undefined) {
		summary.versions.package = safeVersion(packageVersion);
	}
	if (serverVersion !== undefined) {
		summary.versions.server = safeVersion(serverVersion);
	}
}

export function observeStderr(summary, chunk) {
	const bytes = Buffer.isBuffer(chunk)
		? chunk.byteLength
		: Buffer.byteLength(String(chunk));
	summary.stderr.observed ||= bytes > 0;
	const remaining = MAX_STDERR_BYTES - summary.stderr.byteCount;
	summary.stderr.byteCount += Math.min(Math.max(remaining, 0), bytes);
	summary.stderr.truncated ||= bytes > Math.max(remaining, 0);
}

export function recordResult(summary, { name, passed, error, schemaPath }) {
	const category = RESULT_DEFINITIONS.get(name);
	if (!category) throw createDiagnosticError("assertion");
	const result = { name, category, status: passed ? "pass" : "fail" };
	if (!passed) {
		const normalized = normalizeError(error, schemaPath);
		result.errorClass = normalized.errorClass;
		if (normalized.schemaPath) result.schemaPath = normalized.schemaPath;
	}
	summary.results.push(result);
	return result;
}

export function finalizeDiagnostics(summary) {
	const passed = summary.results.filter(
		(result) => result.status === "pass",
	).length;
	const total = summary.results.length;
	summary.totals = { passed, failed: total - passed, total };
	return summary;
}

export function renderResultLine(result) {
	const prefix = result.status === "fail" ? "::error::" : "";
	const fields = [
		`status=${result.status}`,
		`category=${result.category}`,
		`name=${result.name}`,
	];
	if (result.errorClass) fields.push(`error=${result.errorClass}`);
	if (result.schemaPath) fields.push(`path=${result.schemaPath}`);
	return `${prefix}[nightly] ${fields.join(" ")}`;
}

export function renderSummaryLine(summary) {
	return [
		"[nightly-summary]",
		`launcher=${summary.launcher}`,
		`package=${summary.versions.package ?? "unknown"}`,
		`server=${summary.versions.server ?? "unknown"}`,
		`source=${summary.versions.sourceRevision ?? "unknown"}`,
		`passed=${summary.totals.passed}`,
		`failed=${summary.totals.failed}`,
		`total=${summary.totals.total}`,
		`stderrObserved=${summary.stderr.observed}`,
		`stderrBytes=${summary.stderr.byteCount}`,
	].join(" ");
}

function createArtifact(summary) {
	const artifact = createDiagnostics({
		launcher: summary?.launcher,
		packageVersion: summary?.versions?.package,
		serverVersion: summary?.versions?.server,
		sourceRevision: summary?.versions?.sourceRevision,
		runtime: summary?.runtime,
	});
	const byteCount = Number.isSafeInteger(summary?.stderr?.byteCount)
		? Math.min(Math.max(summary.stderr.byteCount, 0), MAX_STDERR_BYTES)
		: 0;
	artifact.stderr = {
		observed: summary?.stderr?.observed === true,
		byteCount,
		truncated: summary?.stderr?.truncated === true,
	};
	if (Array.isArray(summary?.results)) {
		for (const result of summary.results) {
			if (!RESULT_DEFINITIONS.has(result?.name)) continue;
			if (result.status === "pass") {
				recordResult(artifact, { name: result.name, passed: true });
			} else if (result.status === "fail") {
				recordResult(artifact, {
					name: result.name,
					passed: false,
					error: createDiagnosticError(
						ERROR_CLASSES.includes(result.errorClass)
							? result.errorClass
							: "unknown",
						result.schemaPath,
					),
				});
			}
		}
	}
	return finalizeDiagnostics(artifact);
}

export async function writeDiagnostics(path, summary) {
	if (typeof path !== "string" || path.length === 0) return false;
	await mkdir(dirname(path), { recursive: true });
	await writeFile(
		path,
		`${JSON.stringify(createArtifact(summary), null, 2)}\n`,
		{
			encoding: "utf8",
			mode: 0o600,
		},
	);
	return true;
}
