/**
 * Read-only nightly integration test for hevy-mcp using the MCP SDK.
 * Diagnostic output is allowlisted; upstream payloads are never persisted.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";
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

const SEARCH_QUERY = "bench";
const UNKNOWN_WORKOUT_ID = "00000000-0000-0000-0000-000000000000";

export function buildWorkoutPageArgs(page, pageSize) {
	return { page, page_size: pageSize };
}

function assertCondition(condition, schemaPath, kind = "schema") {
	if (!condition) throw createDiagnosticError(kind, schemaPath);
}

function readFirstText(result) {
	const first = result?.content?.[0];
	assertCondition(first, "$.content[0]");
	assertCondition(first.type === "text", "$.content[0].type");
	assertCondition(typeof first.text === "string", "$.content[0].text");
	return first.text;
}

function expectJsonContent(result) {
	const text = readFirstText(result).trim();
	assertCondition(
		text.startsWith("{") || text.startsWith("["),
		"$.content[0].text",
	);
	try {
		return JSON.parse(text);
	} catch {
		throw createDiagnosticError("schema", "$.content[0].text");
	}
}

function parseLauncherConfig() {
	assertCondition(process.env.HEVY_API_KEY, undefined, "assertion");
	const command = process.env.HEVY_MCP_COMMAND?.trim();
	assertCondition(command, undefined, "assertion");
	const argsJson = process.env.HEVY_MCP_ARGS_JSON;
	assertCondition(argsJson, undefined, "assertion");
	let args;
	try {
		args = JSON.parse(argsJson);
	} catch {
		throw createDiagnosticError("assertion");
	}
	assertCondition(
		Array.isArray(args) &&
			args.length > 0 &&
			args.every((arg) => typeof arg === "string"),
		undefined,
		"assertion",
	);
	return { command, args };
}

async function readPackageVersion() {
	try {
		const packageJson = JSON.parse(await readFile("package.json", "utf8"));
		return packageJson.version;
	} catch {
		return null;
	}
}

async function callOrIgnoreEmpty(client, name, args) {
	const result = await client.callTool({ name, arguments: args });
	if (result.isError) throw createDiagnosticError("mcp");
	const text = readFirstText(result).trim();
	if (!text) return { empty: true };
	return { empty: false, parsed: expectJsonContent(result) };
}

async function finishDiagnostics(summary, diagnosticsPath) {
	finalizeDiagnostics(summary);
	console.log(renderSummaryLine(summary));
	try {
		await writeDiagnostics(diagnosticsPath, summary);
	} catch (error) {
		console.error(
			`::error::[nightly] status=fail category=lifecycle name=artifact-write error=${normalizeError(error).errorClass}`,
		);
		process.exitCode = 1;
	}
	if (summary.totals.failed > 0) process.exitCode = 1;
}

async function main() {
	const launcher = process.env.HEVY_MCP_LAUNCHER;
	const localPackageVersion = ["source", "release-source"].includes(launcher)
		? await readPackageVersion()
		: null;
	const summary = createDiagnostics({
		launcher,
		packageVersion: localPackageVersion,
		serverVersion: null,
		sourceRevision: process.env.HEVY_MCP_SOURCE_REVISION,
		runtime: {
			node: process.version,
			platform: process.platform,
			arch: process.arch,
		},
	});
	const diagnosticsPath = process.env.HEVY_MCP_DIAGNOSTICS_PATH;
	let client;
	let setupRecorded = false;

	const report = (name, passed, error) => {
		const result = recordResult(summary, { name, passed, error });
		console.log(renderResultLine(result));
	};
	const runTest = async (name, fn) => {
		try {
			await fn();
			report(name, true);
		} catch (error) {
			report(name, false, error);
		}
	};
	let launcherConfig;
	try {
		launcherConfig = parseLauncherConfig();
		report("configuration", true);
	} catch (error) {
		report("configuration", false, error);
		await finishDiagnostics(summary, diagnosticsPath);
		return;
	}

	try {
		const { command, args } = launcherConfig;
		const transport = new StdioClientTransport({
			command,
			args,
			env: { ...process.env, HEVY_API_KEY: process.env.HEVY_API_KEY },
			stderr: "pipe",
		});
		transport.stderr?.on("data", (chunk) => observeStderr(summary, chunk));
		client = new Client(
			{ name: "hevy-mcp-nightly-test", version: "1.0.0" },
			{ capabilities: {} },
		);
		await client.connect(transport);
		const serverInfo = client.getServerVersion();
		assertCondition(serverInfo?.name, "$.server.name");
		assertCondition(serverInfo?.version, "$.server.version");
		setVersions(summary, {
			packageVersion: serverInfo.version,
			serverVersion: serverInfo.version,
		});
		report("setup-or-handshake", true);
		setupRecorded = true;

		await runTest("server-info", () => {
			assertCondition(serverInfo?.name, "$.server.name");
			assertCondition(serverInfo?.version, "$.server.version");
		});
		await runTest("tools-registered", async () => {
			const response = await client.listTools();
			assertCondition(Array.isArray(response.tools), "$.tools");
			assertCondition(response.tools.length > 0, "$.tools", "assertion");
		});

		await runTest("get-workouts-shape", async () => {
			const { empty, parsed } = await callOrIgnoreEmpty(
				client,
				"get-workouts",
				{ page: 1, page_size: 5 },
			);
			if (empty) return;
			assertCondition(Array.isArray(parsed), "$");
			assertCondition(parsed.length <= 5, "$", "assertion");
			assertCondition(
				parsed[0] === undefined ||
					(parsed[0] !== null && typeof parsed[0] === "object"),
				"$[0]",
			);
		});
		await runTest("get-workout-events-shape", async () => {
			const { empty, parsed } = await callOrIgnoreEmpty(
				client,
				"get-workout-events",
				{ page: 1, page_size: 5 },
			);
			if (empty) return;
			assertCondition(Array.isArray(parsed), "$");
			assertCondition(parsed.length <= 5, "$", "assertion");
		});
		await runTest("get-routines-shape", async () => {
			const { empty, parsed } = await callOrIgnoreEmpty(
				client,
				"get-routines",
				{ page: 1, page_size: 5 },
			);
			if (!empty) assertCondition(Array.isArray(parsed), "$");
		});
		await runTest("search-exercise-templates-shape", async () => {
			const { empty, parsed } = await callOrIgnoreEmpty(
				client,
				"search-exercise-templates",
				{ query: SEARCH_QUERY },
			);
			if (empty) return;
			assertCondition(Array.isArray(parsed), "$");
			if (parsed.length > 0) {
				assertCondition(
					JSON.stringify(parsed)
						.toLowerCase()
						.includes(SEARCH_QUERY.toLowerCase()),
					"$",
					"assertion",
				);
			}
		});
		await runTest("get-body-measurements-shape", async () => {
			const { empty, parsed } = await callOrIgnoreEmpty(
				client,
				"get-body-measurements",
				{ page: 1, page_size: 5 },
			);
			if (!empty) assertCondition(Array.isArray(parsed), "$");
		});
		await runTest("rejects-out-of-range-pageSize", async () => {
			try {
				const result = await client.callTool({
					name: "get-workouts",
					arguments: { page: 1, page_size: 999 },
				});
				assertCondition(result.isError, "$.isError", "assertion");
			} catch (error) {
				if (normalizeError(error).errorClass === "assertion") throw error;
			}
		});
		await runTest("get-workout-handles-unknown-id", async () => {
			const result = await client.callTool({
				name: "get-workout",
				arguments: { workout_id: UNKNOWN_WORKOUT_ID },
			});
			if (!result.isError) readFirstText(result);
		});
	} catch (error) {
		if (!setupRecorded) report("setup-or-handshake", false, error);
	} finally {
		if (client) {
			try {
				await client.close();
			} catch (error) {
				report("client-close", false, error);
			}
		}
	}

	await finishDiagnostics(summary, diagnosticsPath);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
	await main();
