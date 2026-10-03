import { resolve } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { isNumber, isString } from "../../scripts/runtime-value-predicates.mjs";
import {
	Client,
	type JSONObject,
	type JSONValue,
	StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { z } from "zod";
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
	"get-workouts",
	"get-workout",
	"get-workout-events",
	"get-routines",
	"get-training-summary",
	"get-routine",
	"search-routines",
	"get-exercise-template",
	"get-exercise-history",
	"get-routine-folder",
	"get-body-measurements",
	"get-body-measurement",
] as const;
const DISCOVERY_ONLY_READ_TOOLS = ["search-exercise-templates"] as const;
const REQUIRED_READ_TOOLS = [
	...INVOKED_READ_TOOLS,
	...DISCOVERY_ONLY_READ_TOOLS,
] as const;

let cf: ChildProcessWithoutNullStreams | undefined;
let workerBaseUrl = "";
let cfLogs = "";
let cfSpawnError: Error | undefined;

function assertCondition(
	condition: boolean | string | undefined,
	schemaPath: string,
): asserts condition {
	if (!condition)
		throw new Error(`Live Worker response failed at ${schemaPath}`);
}

const jsonValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(jsonValueSchema),
		z.record(z.string(), jsonValueSchema),
	]),
);
const jsonObjectSchema: z.ZodType<JSONObject> = z.record(
	z.string(),
	jsonValueSchema,
);

function assertRecord(
	value: JSONValue | null,
	schemaPath: string,
): asserts value is JSONObject {
	const parsed = jsonObjectSchema.safeParse(value);
	assertCondition(parsed.success, schemaPath);
}

function sanitizeDiagnostic(value: string | Error): string {
	const apiKey = process.env.HEVY_API_KEY;
	let diagnostic = value instanceof Error ? value.message : String(value);
	if (apiKey) diagnostic = diagnostic.replaceAll(apiKey, "[REDACTED]");
	return diagnostic.replaceAll(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

function appendCfLog(chunk: Buffer): void {
	cfLogs = `${cfLogs}${chunk.toString()}`.slice(-MAX_CAPTURED_LOG_LENGTH);
}

function redactedCfLogs(): string {
	return sanitizeDiagnostic(cfLogs);
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

async function allocateCfPort(): Promise<number> {
	const reservation = createServer();
	try {
		return await listen(reservation);
	} finally {
		await close(reservation);
	}
}

function spawnCf(workerPort: number): void {
	workerBaseUrl = `http://${LOOPBACK}:${workerPort}`;
	cfSpawnError = undefined;
	const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
	const childEnv = { ...process.env };
	delete childEnv.HEVY_API_BASE_URL;
	delete childEnv.HEVY_API_KEY;

	cf = spawn(
		npmCommand,
		[
			"exec",
			"--",
			"cf",
			"dev",
			"--host",
			LOOPBACK,
			"--port",
			String(workerPort),
		],
		{
			cwd: resolve(process.cwd(), "packages/worker"),
			detached: process.platform !== "win32",
			env: { ...childEnv, CI: "true", NO_COLOR: "1" },
			stdio: "pipe",
		},
	);
	cf.stdout.on("data", appendCfLog);
	cf.stderr.on("data", appendCfLog);
	cf.once("error", (error) => {
		cfSpawnError = error;
	});
}

async function waitForCfReady(): Promise<void> {
	const deadline = Date.now() + STARTUP_TIMEOUT_MS;
	let lastError = "not ready";
	while (Date.now() < deadline) {
		if (cfSpawnError) throw cfSpawnError;
		if (cf?.exitCode !== null) {
			throw new Error(`Cf exited before readiness.\n${redactedCfLogs()}`);
		}
		try {
			const response = await fetch(`${workerBaseUrl}/ready`, {
				signal: AbortSignal.timeout(500),
			});
			await response.body?.cancel();
			if (response.status === 404) return;
			lastError = `unexpected status ${response.status}`;
		} catch (error) {
			lastError = sanitizeDiagnostic(
				error instanceof Error ? error : String(error),
			);
		}
		await delay(100);
	}
	throw new Error(
		`Cf was not ready within ${STARTUP_TIMEOUT_MS}ms (${lastError}).\n${redactedCfLogs()}`,
	);
}

async function stopCf(): Promise<void> {
	const child = cf;
	if (!child || child.exitCode !== null || child.pid === undefined) return;
	const pid = child.pid;

	const exited = new Promise<void>((resolve) =>
		child.once("exit", () => resolve()),
	);
	const signalProcessGroup = (signal: NodeJS.Signals) => {
		try {
			if (process.platform === "win32") child.kill(signal);
			else process.kill(-pid, signal);
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
		throw new Error(`Cf did not exit after SIGKILL.\n${redactedCfLogs()}`);
	}
}

async function startCf(): Promise<void> {
	const failures: string[] = [];
	for (let attempt = 1; attempt <= MAX_STARTUP_ATTEMPTS; attempt += 1) {
		const workerPort = await allocateCfPort();
		cfLogs = "";
		spawnCf(workerPort);
		try {
			await waitForCfReady();
			return;
		} catch (error) {
			failures.push(
				`Attempt ${attempt}: ${sanitizeDiagnostic(error instanceof Error ? error : String(error))}`,
			);
			await stopCf();
		}
	}
	throw new Error(
		`Cf failed to start after ${MAX_STARTUP_ATTEMPTS} attempts.\n${failures.join("\n")}`,
	);
}

async function callReadTool(
	client: Client,
	name: (typeof INVOKED_READ_TOOLS)[number],
	arguments_: JSONObject,
): Promise<JSONObject> {
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
	const structuredContent = result.structuredContent as JSONObject;
	assertRecord(structuredContent, `tools/${name}/structuredContent`);
	return structuredContent;
}

function assertBoundedList(
	value: JSONValue | null,
	schemaPath: string,
): asserts value is JSONObject[] {
	assertCondition(Array.isArray(value), schemaPath);
	assertCondition(value.length <= 1, `${schemaPath}/length`);
	if (value[0] !== undefined) assertRecord(value[0], `${schemaPath}/0`);
}

function optionalStringId(
	value: JSONObject[] | undefined,
	schemaPath: string,
): string | undefined {
	if (!value?.[0]) return undefined;
	const id = value[0].id;
	assertCondition(isString(id) || isNumber(id), `${schemaPath}/0/id`);
	assertCondition(String(id).length > 0, `${schemaPath}/0/id`);
	return String(id);
}

describeLive("live Cf Worker HTTP integration", () => {
	let client: Client;

	beforeAll(
		async () => {
			await startCf();
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
					`Live Worker initialization failed.\n${redactedCfLogs()}`,
				);
			}
		},
		MAX_STARTUP_ATTEMPTS * STARTUP_TIMEOUT_MS + REQUEST_TIMEOUT_MS,
	);

	afterAll(async () => {
		try {
			await client?.close();
		} finally {
			await stopCf();
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

				const workouts = await callReadTool(client, "get-workouts", {
					page: 1,
					page_size: 1,
				});
				assertBoundedList(workouts.workouts, "tools/get-workouts/workouts");
				const firstWorkout = workouts.workouts[0];
				if (firstWorkout) {
					assertCondition(
						isNumber(firstWorkout.exercise_count) &&
							isNumber(firstWorkout.set_count) &&
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
					page: 1,
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
						isNumber(firstRoutine.exercise_count) &&
							isNumber(firstRoutine.set_count) &&
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
						isString(firstMeasurement.date),
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
