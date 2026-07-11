import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
	createDiagnosticError,
	createDiagnostics,
	finalizeDiagnostics,
	normalizeError,
	observeStderr,
	recordResult,
	renderResultLine,
	renderSummaryLine,
	setVersions,
	writeDiagnostics,
} from "./diagnostics.mjs";

const FORBIDDEN = Object.freeze({
	apiKey: "FORBIDDEN_API_KEY_sentinel_612",
	authorization: "Bearer_FORBIDDEN_AUTH_sentinel_612",
	user: "FORBIDDEN_USER_DATA_sentinel_612",
	id: "FORBIDDEN_ACCOUNT_ID_sentinel_612",
	url: "https://forbidden.example.test/users?token=FORBIDDEN_QUERY_612",
	body: "FORBIDDEN_REQUEST_BODY_sentinel_612",
	traceparent: "FORBIDDEN_TRACEPARENT_sentinel_612",
	tracestate: "FORBIDDEN_TRACESTATE_sentinel_612",
	baggage: "FORBIDDEN_BAGGAGE_sentinel_612",
	mcp: "FORBIDDEN_MCP_PAYLOAD_sentinel_612",
	stack: "FORBIDDEN_STACK_sentinel_612",
	configurationCommand: "FORBIDDEN_COMMAND_sentinel_612",
	configurationArgs: "FORBIDDEN_ARGUMENTS_sentinel_612",
	configurationRevision: "FORBIDDEN_REVISION_sentinel_612",
});

const HARNESS_PATH = fileURLToPath(
	new URL("./test_hevy_mcp.mjs", import.meta.url),
);
const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function createAxiosFixture() {
	const error = {
		name: "AxiosError",
		isAxiosError: true,
		message: FORBIDDEN.apiKey,
		stack: FORBIDDEN.stack,
		config: {
			url: FORBIDDEN.url,
			headers: {
				Authorization: FORBIDDEN.authorization,
				"api-key": FORBIDDEN.apiKey,
				traceparent: FORBIDDEN.traceparent,
				tracestate: FORBIDDEN.tracestate,
				baggage: FORBIDDEN.baggage,
			},
			data: { body: FORBIDDEN.body, user: FORBIDDEN.user },
		},
		request: { accountId: FORBIDDEN.id },
		response: {
			data: { user: FORBIDDEN.user, id: FORBIDDEN.id },
			headers: { authorization: FORBIDDEN.authorization },
		},
		cause: new Error(FORBIDDEN.body),
		large: Array.from({ length: 1_000 }, () => FORBIDDEN.user),
	};
	error.circular = error;
	return error;
}

function createMcpFixture() {
	return {
		name: "McpError",
		code: -32_603,
		message: FORBIDDEN.mcp,
		data: {
			content: [{ type: "text", text: FORBIDDEN.user }],
			id: FORBIDDEN.id,
			url: FORBIDDEN.url,
		},
		cause: { traceparent: FORBIDDEN.traceparent },
	};
}

function assertForbiddenAbsent(rendered) {
	for (const sentinel of Object.values(FORBIDDEN)) {
		assert.equal(rendered.includes(sentinel), false, sentinel);
	}
}

function runHarness(env) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [HARNESS_PATH], {
			cwd: REPOSITORY_ROOT,
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.once("error", reject);
		child.once("close", (code, signal) => {
			resolve({ code, signal, stdout, stderr });
		});
	});
}

test("normalizes supported failure classes without payload fields", () => {
	assert.deepEqual(normalizeError(createAxiosFixture(), "$.response"), {
		errorClass: "axios",
		schemaPath: "$.response",
	});
	assert.deepEqual(normalizeError(createMcpFixture()), {
		errorClass: "mcp",
		schemaPath: null,
	});
	assert.equal(
		normalizeError(createDiagnosticError("schema", "$[0].id")).errorClass,
		"schema",
	);
	assert.equal(
		normalizeError({ name: "AssertionError", message: FORBIDDEN.user })
			.errorClass,
		"assertion",
	);
	assert.equal(
		normalizeError({ code: "ECONNRESET", message: FORBIDDEN.url }).errorClass,
		"transport",
	);
	assert.equal(
		normalizeError({ message: FORBIDDEN.body }).errorClass,
		"unknown",
	);
});

test("configuration failures write safe diagnostics without launching", async (t) => {
	const cases = [
		{
			name: "missing API key",
			env: {
				HEVY_MCP_ARGS_JSON: JSON.stringify([FORBIDDEN.configurationArgs]),
			},
		},
		{
			name: "malformed argument JSON",
			env: {
				HEVY_API_KEY: FORBIDDEN.apiKey,
				HEVY_MCP_ARGS_JSON: `["${FORBIDDEN.configurationArgs}"`,
			},
		},
	];

	for (const fixture of cases) {
		await t.test(fixture.name, async () => {
			const directory = await mkdtemp(join(tmpdir(), "hevy-configuration-"));
			const artifactPath = join(directory, "summary.json");
			const result = await runHarness({
				...fixture.env,
				HEVY_MCP_COMMAND: FORBIDDEN.configurationCommand,
				HEVY_MCP_DIAGNOSTICS_PATH: artifactPath,
				HEVY_MCP_LAUNCHER: "source",
				HEVY_MCP_SOURCE_REVISION: FORBIDDEN.configurationRevision,
			});

			assert.equal(result.code, 1);
			assert.equal(result.signal, null);
			const consoleOutput = `${result.stdout}\n${result.stderr}`;
			assertForbiddenAbsent(consoleOutput);
			assert.match(
				result.stdout,
				/status=fail category=launcher name=configuration error=assertion/,
			);
			assert.doesNotMatch(consoleOutput, /name=setup-or-handshake/);

			const artifact = await readFile(artifactPath, "utf8");
			assertForbiddenAbsent(artifact);
			const parsed = JSON.parse(artifact);
			assert.deepEqual(parsed.results, [
				{
					name: "configuration",
					category: "launcher",
					status: "fail",
					errorClass: "assertion",
				},
			]);
			assert.deepEqual(parsed.totals, { passed: 0, failed: 1, total: 1 });
			assert.deepEqual(parsed.stderr, {
				observed: false,
				byteCount: 0,
				truncated: false,
			});
		});
	}
});

test("console and upload summary exclude every forbidden sentinel", async () => {
	const summary = createDiagnostics({
		launcher: "npx",
		packageVersion: "2.0.0",
		serverVersion: null,
		sourceRevision: "abcdef0123456789",
		runtime: { node: "v24.18.0", platform: "linux", arch: "arm64" },
		extra: FORBIDDEN.user,
	});
	setVersions(summary, { serverVersion: "2.0.0" });
	observeStderr(summary, Buffer.from(FORBIDDEN.authorization));
	observeStderr(summary, Buffer.alloc(70_000, "x"));
	const results = [
		recordResult(summary, {
			name: "setup-or-handshake",
			passed: false,
			error: createAxiosFixture(),
			schemaPath: "$.server.version",
		}),
		recordResult(summary, {
			name: "get-workouts-shape",
			passed: false,
			error: createMcpFixture(),
			schemaPath: "$[0].title",
		}),
		recordResult(summary, {
			name: "tools-registered",
			passed: true,
			error: { message: FORBIDDEN.mcp },
		}),
	];
	finalizeDiagnostics(summary);
	const consoleOutput = [
		...results.map(renderResultLine),
		renderSummaryLine(summary),
	].join("\n");
	assertForbiddenAbsent(consoleOutput);
	assert.match(consoleOutput, /error=axios/);
	assert.match(consoleOutput, /error=mcp/);
	assert.match(consoleOutput, /path=\$\.server\.version/);
	assert.match(consoleOutput, /launcher=npx/);

	const directory = await mkdtemp(join(tmpdir(), "hevy-diagnostics-"));
	const artifactPath = join(directory, "nested", "summary.json");
	await writeDiagnostics(artifactPath, summary);
	const artifact = await readFile(artifactPath, "utf8");
	assertForbiddenAbsent(artifact);
	const parsed = JSON.parse(artifact);
	assert.equal(parsed.launcher, "npx");
	assert.equal(parsed.versions.package, "2.0.0");
	assert.equal(parsed.versions.server, "2.0.0");
	assert.equal(parsed.versions.sourceRevision, null);
	assert.deepEqual(parsed.totals, { passed: 1, failed: 2, total: 3 });
	assert.deepEqual(parsed.stderr, {
		observed: true,
		byteCount: 65_536,
		truncated: true,
	});
	assert.deepEqual(parsed.results[0], {
		name: "setup-or-handshake",
		category: "handshake",
		status: "fail",
		errorClass: "axios",
		schemaPath: "$.server.version",
	});
	assert.equal(
		createDiagnostics({
			launcher: "source",
			sourceRevision: "abcdef0123456789",
		}).versions.sourceRevision,
		"abcdef0123456789",
	);
});

test("default-deny model drops unsafe metadata and schema paths", async () => {
	const summary = createDiagnostics({
		launcher: FORBIDDEN.url,
		packageVersion: FORBIDDEN.user,
		serverVersion: FORBIDDEN.id,
		sourceRevision: FORBIDDEN.apiKey,
		runtime: {
			node: FORBIDDEN.body,
			platform: FORBIDDEN.authorization,
			arch: FORBIDDEN.traceparent,
		},
	});
	const result = recordResult(summary, {
		name: "get-user-info-shape",
		passed: false,
		error: createMcpFixture(),
		schemaPath: `$.users[0].${FORBIDDEN.user}`,
	});
	finalizeDiagnostics(summary);
	summary.forbidden = FORBIDDEN.body;
	summary.results[0].message = FORBIDDEN.mcp;
	summary.stderr.content = FORBIDDEN.authorization;
	const rendered = `${renderResultLine(result)}\n${renderSummaryLine(summary)}`;
	assertForbiddenAbsent(rendered);
	assert.equal(summary.launcher, "unknown");
	assert.equal(result.schemaPath, undefined);

	const directory = await mkdtemp(join(tmpdir(), "hevy-default-deny-"));
	const artifactPath = join(directory, "summary.json");
	await writeDiagnostics(artifactPath, summary);
	const artifact = await readFile(artifactPath, "utf8");
	assertForbiddenAbsent(artifact);
	assert.equal("forbidden" in JSON.parse(artifact), false);
});
