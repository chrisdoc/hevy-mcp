/* oxlint-disable typescript/unbound-method */
import { HevyHttpError, type HevyClient } from "@hevy-mcp/hevy-client";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "./main.js";
import { createEffectClient } from "./test-fixtures/effect-client.js";

vi.mock("@hevy-mcp/operations", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@hevy-mcp/operations")>();
	return {
		...actual,
		createOperations: vi.fn(actual.createOperations),
	};
});

const createOperationsSpy = async () =>
	vi.mocked((await import("@hevy-mcp/operations")).createOperations);

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { readonly [key: string]: JsonValue };

const mockClient = (getWorkouts: HevyClient["getWorkouts"]): HevyClient => {
	return createEffectClient({ getWorkouts });
};

const streams = () => {
	let out = "";
	let err = "";
	return {
		streams: {
			stdout: (text: string) => {
				out += text;
			},
			stderr: (text: string) => {
				err += text;
			},
		},
		get out() {
			return out;
		},
		get err() {
			return err;
		},
	};
};

describe("CLI process contract", () => {
	it("prints help and version without credentials", async () => {
		const io = streams();
		expect(
			await runCli({ argv: ["--help"], env: {}, streams: io.streams }),
		).toBe(0);
		expect(io.out).toContain("workouts");
		expect(io.err).toBe("");
		const outBeforeVersion = io.out;
		expect(
			await runCli({ argv: ["--version"], env: {}, streams: io.streams }),
		).toBe(0);
		expect(io.out.slice(outBeforeVersion.length)).toBe("0.0.0\n");
	});

	it("keeps help and version aliases credential-free", async () => {
		for (const argv of [["-h"], ["-v"]] as const) {
			const io = streams();
			const clientFactory = vi.fn(() => mockClient(vi.fn()));
			const code = await runCli({
				argv: [...argv],
				env: {},
				clientFactory,
				streams: io.streams,
			});
			expect(code).toBe(0);
			expect(clientFactory).not.toHaveBeenCalled();
			expect(io.err).toBe("");
		}
	});

	it("keeps missing credentials on stderr", async () => {
		const io = streams();
		const code = await runCli({ argv: ["user"], env: {}, streams: io.streams });
		expect(code).toBe(1);
		expect(io.out).toBe("");
		expect(io.err).toContain("HEVY_API_KEY");
	});

	it("returns a concise semantic error without calling the API", async () => {
		const io = streams();
		const getWorkouts = vi.fn();
		const code = await runCli({
			argv: ["workouts", "list", "--page", "0"],
			env: { HEVY_API_KEY: "key" },
			streams: io.streams,
			clientFactory: () => mockClient(getWorkouts),
		});
		expect(code).toBe(2);
		expect(io.out).toBe("");
		expect(io.err).toBe("--page must be a positive integer\n");
		expect(io.err).not.toContain("ZodError");
		expect(getWorkouts).not.toHaveBeenCalled();
	});

	it("classifies malformed API responses as API failures", async () => {
		const io = streams();
		const getWorkouts = vi.fn().mockResolvedValue({
			page: 1,
			page_count: "invalid",
			workouts: [],
		});
		const code = await runCli({
			argv: ["workouts", "list"],
			env: { HEVY_API_KEY: "key" },
			streams: io.streams,
			clientFactory: () => mockClient(getWorkouts),
		});
		expect(code).toBe(3);
		expect(io.err).toBe("The API returned invalid pagination metadata\n");
	});

	it("rejects missing pagination metadata as an API failure", async () => {
		const io = streams();
		const getWorkouts = vi.fn().mockResolvedValue({
			page: 1,
			workouts: [],
		});
		const code = await runCli({
			argv: ["workouts", "list"],
			env: { HEVY_API_KEY: "key" },
			streams: io.streams,
			clientFactory: () => mockClient(getWorkouts),
		});
		expect(code).toBe(3);
		expect(io.err).toBe("The API returned invalid pagination metadata\n");
	});

	it("preserves operation pagination failures as API failures", async () => {
		const io = streams();
		const getWorkouts = vi.fn().mockResolvedValue({
			page: 2,
			page_count: 2,
			workouts: [],
		});
		const code = await runCli({
			argv: ["workouts", "list"],
			env: { HEVY_API_KEY: "key" },
			streams: io.streams,
			clientFactory: () => mockClient(getWorkouts),
		});
		expect(code).toBe(3);
		expect(io.err).toBe("The API returned invalid pagination metadata\n");
	});

	it("passes coerced API-shaped values to the client", async () => {
		const io = streams();
		const getWorkouts = vi.fn().mockResolvedValue({
			page: 2,
			page_count: 2,
			workouts: [],
		});
		const code = await runCli({
			argv: ["workouts", "list", "--page", "2", "--page-size", "10"],
			env: { HEVY_API_KEY: "key" },
			streams: io.streams,
			clientFactory: () => mockClient(getWorkouts),
		});
		expect(code).toBe(0);
		expect(getWorkouts).toHaveBeenCalledWith({ page: 2, pageSize: 10 });
		expect(io.err).toBe("");
	});

	it("keeps the legacy summary week range", async () => {
		const io = streams();
		const getWorkouts = vi.fn().mockResolvedValue({
			page: 1,
			page_count: 1,
			workouts: [],
		});
		const getBodyMeasurements = vi.fn().mockResolvedValue({
			page: 1,
			page_count: 1,
			body_measurements: [],
		});
		const code = await runCli({
			argv: ["summary", "--weeks", "13", "--json"],
			env: { HEVY_API_KEY: "key" },
			streams: io.streams,
			clientFactory: () =>
				createEffectClient({ getWorkouts, getBodyMeasurements }),
		});
		expect(code).toBe(0);
		expect(JSON.parse(io.out)).toMatchObject({ weeks: 13 });
	});

	it("classifies invalid summary dates as API failures", async () => {
		const io = streams();
		const getWorkouts = vi.fn().mockResolvedValue({
			page: 1,
			page_count: 1,
			workouts: [{ id: "w1", start_time: "not-a-date" }],
		});
		const getBodyMeasurements = vi.fn().mockResolvedValue({
			page: 1,
			page_count: 1,
			body_measurements: [],
		});
		const code = await runCli({
			argv: ["summary", "--json"],
			env: { HEVY_API_KEY: "key" },
			streams: io.streams,
			clientFactory: () =>
				createEffectClient({ getWorkouts, getBodyMeasurements }),
		});
		expect(code).toBe(3);
		expect(JSON.parse(io.err)).toMatchObject({
			message: "The API returned an item with an invalid date",
		});
	});

	it("classifies malformed summary pagination as an API failure", async () => {
		const io = streams();
		const getWorkouts = vi.fn().mockResolvedValue({
			page: 1,
			workouts: [],
		});
		const getBodyMeasurements = vi.fn().mockResolvedValue({
			page: 1,
			page_count: 1,
			body_measurements: [],
		});
		const code = await runCli({
			argv: ["summary", "--json"],
			env: { HEVY_API_KEY: "key" },
			streams: io.streams,
			clientFactory: () =>
				createEffectClient({ getWorkouts, getBodyMeasurements }),
		});
		expect(code).toBe(3);
		expect(JSON.parse(io.err)).toMatchObject({
			message: "The API returned invalid pagination metadata",
		});
	});

	it("binds invocation control and projects execution fields in JSON errors", async () => {
		const io = streams();
		const signal = new AbortController().signal;
		const deadline = Date.now() + 1_000;
		const getWorkouts = vi.fn().mockRejectedValue(
			new HevyHttpError("request failed", {
				status: 503,
				method: "GET",
				endpoint: "/v1/workouts",
				phase: "response-content",
				operationSafety: "read",
				commitState: "unknown",
				safeToRetry: false,
				outcome: "deadline_exceeded",
			}),
		);
		const code = await runCli({
			argv: ["workouts", "list", "--json"],
			env: { HEVY_API_KEY: "key" },
			clientFactory: () => mockClient(getWorkouts),
			execution: { signal, deadline },
			streams: io.streams,
		});
		expect(code).toBe(3);
		expect(getWorkouts).toHaveBeenCalledWith(
			{ page: 1, pageSize: 5 },
			expect.objectContaining({ signal, deadline }),
		);
		expect(JSON.parse(io.err)).toMatchObject({
			outcome: "deadline_exceeded",
			phase: "response-content",
			operation_safety: "read",
			commit_state: "unknown",
			safe_to_retry: false,
		});
	});

	it("builds operations from the execution-bound client proxy", async () => {
		const io = streams();
		const signal = new AbortController().signal;
		const deadline = Date.now() + 1_000;
		const getWorkouts = vi.fn().mockResolvedValue({
			page: 1,
			page_count: 1,
			workouts: [],
		});
		const rawClient = mockClient(getWorkouts);
		const spy = await createOperationsSpy();
		spy.mockClear();
		const code = await runCli({
			argv: ["workouts", "list"],
			env: { HEVY_API_KEY: "key" },
			clientFactory: () => rawClient,
			execution: { signal, deadline },
			streams: io.streams,
		});
		expect(code).toBe(0);
		expect(spy).toHaveBeenCalledTimes(1);
		const [operationsClient] = spy.mock.calls[0];
		expect(operationsClient).not.toBe(rawClient);
		getWorkouts.mockClear();
		await operationsClient.getWorkouts({ page: 1, pageSize: 5 });
		expect(getWorkouts).toHaveBeenCalledWith(
			{ page: 1, pageSize: 5 },
			expect.objectContaining({ signal, deadline }),
		);
	});

	it("keeps operations on the raw client without execution", async () => {
		const io = streams();
		const getWorkouts = vi.fn().mockResolvedValue({
			page: 1,
			page_count: 1,
			workouts: [],
		});
		const rawClient = mockClient(getWorkouts);
		const spy = await createOperationsSpy();
		spy.mockClear();
		const code = await runCli({
			argv: ["workouts", "list"],
			env: { HEVY_API_KEY: "key" },
			clientFactory: () => rawClient,
			streams: io.streams,
		});
		expect(code).toBe(0);
		expect(spy).toHaveBeenCalledTimes(1);
		const [operationsClient] = spy.mock.calls[0];
		expect(operationsClient).toBe(rawClient);
	});
});

function mutationClient(): HevyClient {
	return createEffectClient({
		getWorkout: vi.fn().mockResolvedValue({
			id: "workout-1",
			title: "Push",
			description: null,
			start_time: "2024-01-01T10:00:00Z",
			end_time: "2024-01-01T11:00:00Z",
			exercises: [],
		}),
		createWorkout: vi.fn().mockResolvedValue({ id: "workout-1" }),
		updateWorkout: vi.fn().mockResolvedValue({ id: "workout-1" }),
		createRoutine: vi.fn().mockResolvedValue({ id: "routine-1" }),
		updateRoutine: vi.fn().mockResolvedValue({ id: "routine-1" }),
		createExerciseTemplate: vi.fn().mockResolvedValue({ id: 2 }),
		createRoutineFolder: vi.fn().mockResolvedValue({ id: 3 }),
		createBodyMeasurement: vi.fn().mockResolvedValue({
			date: "2024-01-02",
			weight_kg: 80,
		}),
		getBodyMeasurement: vi.fn().mockResolvedValue({
			date: "2024-01-02",
			weight_kg: 80,
		}),
		updateBodyMeasurement: vi.fn().mockResolvedValue({
			date: "2024-01-02",
			weight_kg: 81,
		}),
	});
}

describe("CLI mutation process contract", () => {
	it("requires --yes before reading data or invoking a mutation", async () => {
		for (const confirmation of [undefined, "--noYes"]) {
			const io = streams();
			const readDataSource = vi.fn().mockResolvedValue("{}");
			const clientFactory = vi.fn(() => mutationClient());
			const argv = [
				"folders",
				"create",
				"--data",
				'{"name":"Strength"}',
				...(confirmation ? [confirmation] : []),
			];
			const code = await runCli({
				argv,
				env: { HEVY_API_KEY: "key" },
				clientFactory,
				readDataSource,
				streams: io.streams,
			});
			expect(code).toBe(2);
			expect(io.out).toBe("");
			expect(io.err).toBe("Mutation requires --yes\n");
			expect(readDataSource).not.toHaveBeenCalled();
		}
	});

	it("routes all eight mutations through runCli", async () => {
		const workout = {
			workout: {
				title: "Push",
				start_time: "2024-01-01T10:00:00Z",
				end_time: "2024-01-01T11:00:00Z",
				exercises: [],
			},
		};
		const routine = {
			routine: {
				title: "Strength",
				exercises: [
					{
						exercise_template_id: "bench-press",
						sets: [{ weight_kg: 60, reps: 10 }],
					},
				],
			},
		};
		const json = (value: JsonObject) => JSON.stringify(value);
		const commands = [
			["workouts", "create", "--data", json(workout), "--yes", "--json"],
			[
				"workouts",
				"update",
				"workout-1",
				"--data",
				json({ workout_id: "workout-1", ...workout }),
				"--yes",
				"--json",
			],
			["routines", "create", "--data", json(routine), "--yes", "--json"],
			[
				"routines",
				"update",
				"routine-1",
				"--data",
				json({ routine_id: "routine-1", ...routine }),
				"--yes",
				"--json",
			],
			[
				"exercises",
				"create",
				"--data",
				json({
					exercise: {
						title: "Cable Row",
						exercise_type: "weight_reps",
						equipment_category: "machine",
						muscle_group: "upper_back",
					},
				}),
				"--yes",
				"--json",
			],
			[
				"folders",
				"create",
				"--data",
				json({ routine_folder: { title: "Strength" } }),
				"--yes",
				"--json",
			],
			[
				"measurements",
				"create",
				"2024-01-02",
				"--data",
				json({ date: "2024-01-02", weight_kg: 80 }),
				"--yes",
				"--json",
			],
			[
				"measurements",
				"update",
				"2024-01-02",
				"--data",
				json({ date: "2024-01-02", weight_kg: 81 }),
				"--yes",
				"--json",
			],
		] as const;
		const output: string[] = [];
		const client = mutationClient();
		for (const argv of commands) {
			const io = streams();
			const code = await runCli({
				argv: [...argv],
				env: { HEVY_API_KEY: "key" },
				clientFactory: () => client,
				streams: io.streams,
			});
			expect(code).toBe(0);
			expect(io.err).toBe("");
			output.push(io.out);
		}
		expect(output).toHaveLength(8);
		expect(output.every((value) => value.endsWith("\n"))).toBe(true);
		expect(client.createWorkout).toHaveBeenCalledTimes(1);
		expect(client.updateWorkout).toHaveBeenCalledTimes(1);
		expect(client.createRoutine).toHaveBeenCalledTimes(1);
		expect(client.updateRoutine).toHaveBeenCalledTimes(1);
		expect(client.createExerciseTemplate).toHaveBeenCalledTimes(1);
		expect(client.createRoutineFolder).toHaveBeenCalledTimes(1);
		expect(client.createBodyMeasurement).toHaveBeenCalledTimes(1);
		expect(client.getBodyMeasurement).toHaveBeenCalledTimes(1);
		expect(client.updateBodyMeasurement).toHaveBeenCalledTimes(1);
	});

	it.each([
		[401, "Authentication failed; check HEVY_API_KEY"],
		[403, "Hevy API request failed (HTTP 403)"],
	] as const)("uses safe HTTP diagnostics for %s", async (status, message) => {
		const io = streams();
		const getWorkouts = vi.fn().mockRejectedValue(
			new HevyHttpError("request failed", {
				status,
				method: "GET",
				endpoint: "/v1/workouts",
			}),
		);
		const code = await runCli({
			argv: ["workouts", "list"],
			env: { HEVY_API_KEY: "key" },
			clientFactory: () => mockClient(getWorkouts),
			streams: io.streams,
		});
		expect(code).toBe(3);
		expect(io.out).toBe("");
		expect(io.err).toBe(`${message}\n`);
	});

	it.each([
		["HEVY_REQUEST_ABORTED", undefined, 4],
		["HEVY_DEADLINE_EXCEEDED", undefined, 4],
		["HEVY_RETRY_EXHAUSTED", 503, 3],
	] as const)(
		"preserves %s in JSON diagnostics after Effect collapse",
		async (errorCode, status, expectedExitCode) => {
			const io = streams();
			const getWorkouts = vi.fn().mockRejectedValue(
				new HevyHttpError("request failed", {
					status,
					method: "GET",
					endpoint: "/v1/workouts",
					code: errorCode,
					outcome:
						errorCode === "HEVY_REQUEST_ABORTED"
							? "cancelled"
							: errorCode === "HEVY_DEADLINE_EXCEEDED"
								? "deadline_exceeded"
								: "terminal_failure",
				}),
			);
			const code = await runCli({
				argv: ["workouts", "list", "--json"],
				env: { HEVY_API_KEY: "key" },
				clientFactory: () => mockClient(getWorkouts),
				streams: io.streams,
			});

			expect(code).toBe(expectedExitCode);
			expect(JSON.parse(io.err)).toMatchObject({
				error_code: errorCode,
			});
		},
	);
});
