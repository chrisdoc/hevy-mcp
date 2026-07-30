import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import {
	Client,
	StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
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

const INVOKED_READ_TOOLS = [
	"get-user-info",
	"get-workout-count",
	"get-workouts",
	"get-workout",
	"get-workout-events",
	"get-routines",
	"get-training-summary",
	"get-routine",
	"search-routines",
	"get-exercise-templates",
	"get-exercise-template",
	"get-exercise-history",
	"get-routine-folders",
	"get-routine-folder",
	"get-body-measurements",
	"get-body-measurement",
] as const;
const DISCOVERY_ONLY_READ_TOOLS = ["search-exercise-templates"] as const;
const REQUIRED_READ_TOOLS = [
	...INVOKED_READ_TOOLS,
	...DISCOVERY_ONLY_READ_TOOLS,
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
			"--x-new-config",
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
	name: (typeof INVOKED_READ_TOOLS)[number],
	arguments_: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	let result;
	try {
		result = await client.callTool(
			{ name, arguments: arguments_ },
			{
				timeout: REQUEST_TIMEOUT_MS,
			},
		);
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
	const id = value[0].id;
	assertCondition(
		typeof id === "string" || typeof id === "number",
		`${schemaPath}/0/id`,
	);
	assertCondition(String(id).length > 0, `${schemaPath}/0/id`);
	return String(id);
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
					typeof workoutCount.workout_count === "number" &&
						Number.isInteger(workoutCount.workout_count) &&
						workoutCount.workout_count >= 0,
					"tools/get-workout-count/workout_count",
				);

				const workouts = await callReadTool(client, "get-workouts", {
					page: 1,
					page_size: 1,
				});
				assertBoundedList(workouts.workouts, "tools/get-workouts/workouts");
				const firstWorkout = workouts.workouts[0];
				if (firstWorkout) {
					assertCondition(
						typeof firstWorkout.exercise_count === "number" &&
							typeof firstWorkout.set_count === "number" &&
							!("exercises" in firstWorkout),
						"tools/get-workouts/workouts/0/compact",
					);
				}
				const trainingSummary = await callReadTool(
					client,
					"get-training-summary",
					{ weeks: 1 },
				);
				assertRecord(
					trainingSummary.workouts,
					"tools/get-training-summary/workouts",
				);
				assertRecord(
					trainingSummary.body_measurements,
					"tools/get-training-summary/body_measurements",
				);
				assertRecord(trainingSummary.scan, "tools/get-training-summary/scan");
				const workoutId = optionalStringId(
					workouts.workouts,
					"tools/get-workouts/workouts",
				);
				if (workoutId) {
					const workout = await callReadTool(client, "get-workout", {
						workout_id: workoutId,
					});
					assertRecord(workout.workout, "tools/get-workout/workout");
					assertCondition(
						workout.workout.id === workoutId,
						"tools/get-workout/workout/id",
					);
				}

				const events = await callReadTool(client, "get-workout-events", {
					page_size: 1,
					since: "1970-01-01T00:00:00Z",
				});
				assertBoundedList(events.events, "tools/get-workout-events/events");

				const routines = await callReadTool(client, "get-routines", {
					page: 1,
					page_size: 1,
				});
				assertBoundedList(routines.routines, "tools/get-routines/routines");
				const firstRoutine = routines.routines[0];
				if (firstRoutine) {
					assertCondition(
						typeof firstRoutine.exercise_count === "number" &&
							typeof firstRoutine.set_count === "number" &&
							!("exercises" in firstRoutine),
						"tools/get-routines/routines/0/compact",
					);
				}
				const discoveredRoutines = await callReadTool(
					client,
					"search-routines",
					{ query: "a", limit: 1 },
				);
				assertBoundedList(
					discoveredRoutines.routines,
					"tools/search-routines/routines",
				);
				const routineId = optionalStringId(
					routines.routines,
					"tools/get-routines/routines",
				);
				if (routineId) {
					const routine = await callReadTool(client, "get-routine", {
						routine_id: routineId,
					});
					assertRecord(routine.routine, "tools/get-routine/routine");
					assertCondition(
						routine.routine.id === routineId,
						"tools/get-routine/routine/id",
					);
				}

				const templates = await callReadTool(client, "get-exercise-templates", {
					page: 1,
					page_size: 1,
				});
				assertBoundedList(
					templates.exercise_templates,
					"tools/get-exercise-templates/exercise_templates",
				);
				const exerciseTemplateId = optionalStringId(
					templates.exercise_templates,
					"tools/get-exercise-templates/exercise_templates",
				);
				if (exerciseTemplateId) {
					const template = await callReadTool(client, "get-exercise-template", {
						exercise_template_id: exerciseTemplateId,
					});
					assertRecord(
						template.exercise_template,
						"tools/get-exercise-template/exercise_template",
					);
					assertCondition(
						template.exercise_template.id === exerciseTemplateId,
						"tools/get-exercise-template/exercise_template/id",
					);

					const endDate = new Date();
					const startDate = new Date(
						endDate.getTime() - 7 * 24 * 60 * 60 * 1000,
					);
					const history = await callReadTool(client, "get-exercise-history", {
						exercise_template_id: exerciseTemplateId,
						start_date: startDate.toISOString(),
						end_date: endDate.toISOString(),
					});
					assertCondition(
						Array.isArray(history.exercise_history),
						"tools/get-exercise-history/exercise_history",
					);
				}

				const folders = await callReadTool(client, "get-routine-folders", {
					page: 1,
					page_size: 1,
				});
				assertBoundedList(
					folders.routine_folders,
					"tools/get-routine-folders/routine_folders",
				);
				const folderId = optionalStringId(
					folders.routine_folders,
					"tools/get-routine-folders/routine_folders",
				);
				if (folderId) {
					const folder = await callReadTool(client, "get-routine-folder", {
						folder_id: folderId,
					});
					assertRecord(
						folder.routine_folder,
						"tools/get-routine-folder/routine_folder",
					);
					assertCondition(
						String(folder.routine_folder.id) === folderId,
						"tools/get-routine-folder/routine_folder/id",
					);
				}

				const measurements = await callReadTool(
					client,
					"get-body-measurements",
					{ page: 1, page_size: 1 },
				);
				assertBoundedList(
					measurements.body_measurements,
					"tools/get-body-measurements/body_measurements",
				);
				const firstMeasurement = measurements.body_measurements[0];
				if (firstMeasurement) {
					assertCondition(
						typeof firstMeasurement.date === "string",
						"tools/get-body-measurements/body_measurements/0/date",
					);
					const measurement = await callReadTool(
						client,
						"get-body-measurement",
						{ date: firstMeasurement.date },
					);
					assertRecord(
						measurement.body_measurement,
						"tools/get-body-measurement/body_measurement",
					);
					assertCondition(
						measurement.body_measurement.date === firstMeasurement.date,
						"tools/get-body-measurement/body_measurement/date",
					);
				}
			},
			12 * REQUEST_TIMEOUT_MS,
		);
	});
});
