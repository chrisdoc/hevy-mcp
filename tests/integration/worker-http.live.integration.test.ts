import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, it } from "vitest";

const LOOPBACK = "127.0.0.1";
const STARTUP_TIMEOUT_MS = 20_000;
const MAX_STARTUP_ATTEMPTS = 3;
const SHUTDOWN_TIMEOUT_MS = 3_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_CAPTURED_LOG_LENGTH = 32 * 1024;
const LIVE_TESTS_ENABLED =
	process.env.HEVY_RUN_LIVE_WORKER_TESTS === "1" &&
	Boolean(process.env.HEVY_API_KEY);
const describeLive = LIVE_TESTS_ENABLED ? describe.sequential : describe.skip;

const REQUIRED_READ_TOOLS = [
	"get-user-info",
	"get-workout-count",
	"get-workouts",
	"get-workout",
	"get-workout-events",
	"get-routines",
	"get-routine",
	"get-exercise-templates",
	"get-exercise-template",
	"get-exercise-history",
	"search-exercise-templates",
	"get-routine-folders",
	"get-routine-folder",
	"get-body-measurements",
	"get-body-measurement",
] as const;

let wrangler: ChildProcessWithoutNullStreams | undefined;
let workerBaseUrl = "";
let wranglerLogs = "";
let wranglerSpawnError: Error | undefined;

function assertCondition(
	condition: unknown,
	schemaPath: string,
): asserts condition {
	if (!condition)
		throw new Error(`Live Worker response failed at ${schemaPath}`);
}

function assertRecord(
	value: unknown,
	schemaPath: string,
): asserts value is Record<string, unknown> {
	assertCondition(value !== null && typeof value === "object", schemaPath);
}

function sanitizeDiagnostic(value: unknown): string {
	const apiKey = process.env.HEVY_API_KEY;
	let diagnostic = value instanceof Error ? value.message : String(value);
	if (apiKey) diagnostic = diagnostic.replaceAll(apiKey, "[REDACTED]");
	return diagnostic.replaceAll(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

function appendWranglerLog(chunk: Buffer): void {
	wranglerLogs = `${wranglerLogs}${chunk.toString()}`.slice(
		-MAX_CAPTURED_LOG_LENGTH,
	);
}

function redactedWranglerLogs(): string {
	return sanitizeDiagnostic(wranglerLogs);
}

function listen(server: Server): Promise<number> {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, LOOPBACK, () => {
			server.off("error", reject);
			resolve((server.address() as AddressInfo).port);
		});
	});
}

function close(server: Server): Promise<void> {
	if (!server.listening) return Promise.resolve();
	server.closeAllConnections();
	return new Promise((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
}

async function allocateWranglerPorts(): Promise<{
	inspectorPort: number;
	workerPort: number;
}> {
	const workerReservation = createServer();
	const inspectorReservation = createServer();
	try {
		const [workerPort, inspectorPort] = await Promise.all([
			listen(workerReservation),
			listen(inspectorReservation),
		]);
		return { inspectorPort, workerPort };
	} finally {
		await Promise.all([close(workerReservation), close(inspectorReservation)]);
	}
}

function spawnWrangler(workerPort: number, inspectorPort: number): void {
	workerBaseUrl = `http://${LOOPBACK}:${workerPort}`;
	wranglerSpawnError = undefined;
	const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
	const childEnv = { ...process.env };
	delete childEnv.HEVY_API_BASE_URL;
	delete childEnv.HEVY_API_KEY;

	wrangler = spawn(
		npmCommand,
		[
			"exec",
			"--",
			"wrangler",
			"dev",
			"--local",
			"--ip",
			LOOPBACK,
			"--port",
			String(workerPort),
			"--inspector-ip",
			LOOPBACK,
			"--inspector-port",
			String(inspectorPort),
			"--local-protocol",
			"http",
			"--show-interactive-dev-session=false",
			"--log-level",
			"warn",
		],
		{
			cwd: process.cwd(),
			detached: process.platform !== "win32",
			env: { ...childEnv, CI: "true", NO_COLOR: "1" },
			stdio: "pipe",
		},
	);
	wrangler.stdout.on("data", appendWranglerLog);
	wrangler.stderr.on("data", appendWranglerLog);
	wrangler.once("error", (error) => {
		wranglerSpawnError = error;
	});
}

async function waitForWranglerReady(): Promise<void> {
	const deadline = Date.now() + STARTUP_TIMEOUT_MS;
	let lastError = "not ready";
	while (Date.now() < deadline) {
		if (wranglerSpawnError) throw wranglerSpawnError;
		if (wrangler?.exitCode !== null) {
			throw new Error(
				`Wrangler exited before readiness.\n${redactedWranglerLogs()}`,
			);
		}
		try {
			const response = await fetch(`${workerBaseUrl}/ready`, {
				signal: AbortSignal.timeout(500),
			});
			await response.body?.cancel();
			if (response.status === 404) return;
			lastError = `unexpected status ${response.status}`;
		} catch (error) {
			lastError = sanitizeDiagnostic(error);
		}
		await delay(100);
	}
	throw new Error(
		`Wrangler was not ready within ${STARTUP_TIMEOUT_MS}ms (${lastError}).\n${redactedWranglerLogs()}`,
	);
}

async function stopWrangler(): Promise<void> {
	if (!wrangler || wrangler.exitCode !== null || wrangler.pid === undefined)
		return;

	const exited = new Promise<void>((resolve) =>
		wrangler?.once("exit", () => resolve()),
	);
	const signalProcessGroup = (signal: NodeJS.Signals) => {
		try {
			if (process.platform === "win32") wrangler?.kill(signal);
			else process.kill(-wrangler!.pid!, signal);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
		}
	};

	signalProcessGroup("SIGTERM");
	const terminated = await Promise.race([
		exited.then(() => true),
		delay(SHUTDOWN_TIMEOUT_MS).then(() => false),
	]);
	if (terminated) return;

	signalProcessGroup("SIGKILL");
	const killed = await Promise.race([
		exited.then(() => true),
		delay(SHUTDOWN_TIMEOUT_MS).then(() => false),
	]);
	if (!killed) {
		throw new Error(
			`Wrangler did not exit after SIGKILL.\n${redactedWranglerLogs()}`,
		);
	}
}

async function startWrangler(): Promise<void> {
	const failures: string[] = [];
	for (let attempt = 1; attempt <= MAX_STARTUP_ATTEMPTS; attempt += 1) {
		const { inspectorPort, workerPort } = await allocateWranglerPorts();
		wranglerLogs = "";
		spawnWrangler(workerPort, inspectorPort);
		try {
			await waitForWranglerReady();
			return;
		} catch (error) {
			failures.push(`Attempt ${attempt}: ${sanitizeDiagnostic(error)}`);
			await stopWrangler();
		}
	}
	throw new Error(
		`Wrangler failed to start after ${MAX_STARTUP_ATTEMPTS} attempts.\n${failures.join("\n")}`,
	);
}

async function callReadTool(
	client: Client,
	name: (typeof REQUIRED_READ_TOOLS)[number],
	arguments_: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	let result;
	try {
		result = await client.callTool({ name, arguments: arguments_ }, undefined, {
			timeout: REQUEST_TIMEOUT_MS,
		});
	} catch {
		throw new Error(`Live Worker request failed for tools/${name}`);
	}
	assertCondition(result.isError !== true, `tools/${name}/isError`);
	assertRecord(result.structuredContent, `tools/${name}/structuredContent`);
	return result.structuredContent;
}

function assertBoundedList(
	value: unknown,
	schemaPath: string,
): asserts value is Record<string, unknown>[] {
	assertCondition(Array.isArray(value), schemaPath);
	assertCondition(value.length <= 1, `${schemaPath}/length`);
	if (value[0] !== undefined) assertRecord(value[0], `${schemaPath}/0`);
}

function optionalStringId(
	value: Record<string, unknown>[] | undefined,
	schemaPath: string,
): string | undefined {
	if (!value?.[0]) return undefined;
	assertCondition(typeof value[0].id === "string", `${schemaPath}/0/id`);
	assertCondition(value[0].id.length > 0, `${schemaPath}/0/id`);
	return value[0].id;
}

describeLive("live Wrangler Worker HTTP integration", () => {
	let client: Client;

	beforeAll(
		async () => {
			await startWrangler();
			const apiKey = process.env.HEVY_API_KEY;
			assertCondition(apiKey, "configuration/HEVY_API_KEY");
			client = new Client({
				name: "worker-http-live-integration",
				version: "1.0.0",
			});
			const transport = new StreamableHTTPClientTransport(
				new URL(`${workerBaseUrl}/mcp`),
				{
					requestInit: {
						headers: { authorization: `Bearer ${apiKey}` },
					},
				},
			);
			try {
				await client.connect(transport, { timeout: REQUEST_TIMEOUT_MS });
			} catch {
				throw new Error(
					`Live Worker initialization failed.\n${redactedWranglerLogs()}`,
				);
			}
		},
		MAX_STARTUP_ATTEMPTS * STARTUP_TIMEOUT_MS + REQUEST_TIMEOUT_MS,
	);

	afterAll(async () => {
		try {
			await client?.close();
		} finally {
			await stopWrangler();
		}
	}, 10_000);

	describe("read-only production API path", () => {
		it(
			"initializes, lists tools, and exercises representative reads",
			async () => {
				const serverVersion = client.getServerVersion();
				assertCondition(serverVersion?.name, "initialize/serverInfo/name");
				assertCondition(
					serverVersion?.version,
					"initialize/serverInfo/version",
				);

				let listed;
				try {
					listed = await client.listTools(undefined, {
						timeout: REQUEST_TIMEOUT_MS,
					});
				} catch {
					throw new Error("Live Worker request failed for tools/list");
				}
				assertCondition(Array.isArray(listed.tools), "tools/list/tools");
				const toolNames = new Set(listed.tools.map((tool) => tool.name));
				for (const name of REQUIRED_READ_TOOLS) {
					assertCondition(toolNames.has(name), `tools/list/${name}`);
				}

				const user = await callReadTool(client, "get-user-info", {});
				assertRecord(user.user, "tools/get-user-info/user");

				const workoutCount = await callReadTool(
					client,
					"get-workout-count",
					{},
				);
				assertCondition(
					typeof workoutCount.count === "number" &&
						Number.isInteger(workoutCount.count) &&
						workoutCount.count >= 0,
					"tools/get-workout-count/count",
				);

				const workouts = await callReadTool(client, "get-workouts", {
					page: 1,
					pageSize: 1,
				});
				assertBoundedList(workouts.workouts, "tools/get-workouts/workouts");
				const workoutId = optionalStringId(
					workouts.workouts,
					"tools/get-workouts/workouts",
				);
				if (workoutId) {
					const workout = await callReadTool(client, "get-workout", {
						workoutId,
					});
					assertRecord(workout.workout, "tools/get-workout/workout");
					assertCondition(
						workout.workout.id === workoutId,
						"tools/get-workout/workout/id",
					);
				}

				const events = await callReadTool(client, "get-workout-events", {
					page: 1,
					pageSize: 1,
					since: "1970-01-01T00:00:00Z",
				});
				assertBoundedList(events.events, "tools/get-workout-events/events");

				const routines = await callReadTool(client, "get-routines", {
					page: 1,
					pageSize: 1,
				});
				assertBoundedList(routines.routines, "tools/get-routines/routines");
				const routineId = optionalStringId(
					routines.routines,
					"tools/get-routines/routines",
				);
				if (routineId) {
					const routine = await callReadTool(client, "get-routine", {
						routineId,
					});
					assertRecord(routine.routine, "tools/get-routine/routine");
					assertCondition(
						routine.routine.id === routineId,
						"tools/get-routine/routine/id",
					);
				}

				const templates = await callReadTool(client, "get-exercise-templates", {
					page: 1,
					pageSize: 1,
				});
				assertBoundedList(
					templates.exerciseTemplates,
					"tools/get-exercise-templates/exerciseTemplates",
				);
				const exerciseTemplateId = optionalStringId(
					templates.exerciseTemplates,
					"tools/get-exercise-templates/exerciseTemplates",
				);
				if (exerciseTemplateId) {
					const template = await callReadTool(client, "get-exercise-template", {
						exerciseTemplateId,
					});
					assertRecord(
						template.exerciseTemplate,
						"tools/get-exercise-template/exerciseTemplate",
					);
					assertCondition(
						template.exerciseTemplate.id === exerciseTemplateId,
						"tools/get-exercise-template/exerciseTemplate/id",
					);

					const history = await callReadTool(client, "get-exercise-history", {
						exerciseTemplateId,
					});
					assertCondition(
						Array.isArray(history.exerciseHistory),
						"tools/get-exercise-history/exerciseHistory",
					);
				}

				const search = await callReadTool(client, "search-exercise-templates", {
					query: "bench",
				});
				assertCondition(
					Array.isArray(search.exerciseTemplates),
					"tools/search-exercise-templates/exerciseTemplates",
				);

				const folders = await callReadTool(client, "get-routine-folders", {
					page: 1,
					pageSize: 1,
				});
				assertBoundedList(
					folders.routineFolders,
					"tools/get-routine-folders/routineFolders",
				);
				const folderId = optionalStringId(
					folders.routineFolders,
					"tools/get-routine-folders/routineFolders",
				);
				if (folderId) {
					const folder = await callReadTool(client, "get-routine-folder", {
						folderId,
					});
					assertRecord(
						folder.routineFolder,
						"tools/get-routine-folder/routineFolder",
					);
					assertCondition(
						folder.routineFolder.id === folderId,
						"tools/get-routine-folder/routineFolder/id",
					);
				}

				const measurements = await callReadTool(
					client,
					"get-body-measurements",
					{ page: 1, pageSize: 1 },
				);
				assertBoundedList(
					measurements.bodyMeasurements,
					"tools/get-body-measurements/bodyMeasurements",
				);
				const firstMeasurement = measurements.bodyMeasurements[0];
				if (firstMeasurement) {
					assertCondition(
						typeof firstMeasurement.date === "string",
						"tools/get-body-measurements/bodyMeasurements/0/date",
					);
					const measurement = await callReadTool(
						client,
						"get-body-measurement",
						{ date: firstMeasurement.date },
					);
					assertRecord(
						measurement.bodyMeasurement,
						"tools/get-body-measurement/bodyMeasurement",
					);
					assertCondition(
						measurement.bodyMeasurement.date === firstMeasurement.date,
						"tools/get-body-measurement/bodyMeasurement/date",
					);
				}
			},
			12 * REQUEST_TIMEOUT_MS,
		);
	});
});
