/* oxlint-disable typescript/unbound-method */
import {
	ApiError,
	createHevyClient,
	HevyHttpError,
	NetworkError,
	NotFoundError,
	RateLimitError,
	type HevyClient,
	ValidationError,
} from "@hevy-mcp/hevy-client";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
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

	it("writes opt-in structured command events to stderr", async () => {
		const io = streams();
		const getWorkouts = vi.fn().mockResolvedValue({
			page: 1,
			page_count: 1,
			workouts: [],
		});
		const code = await runCli({
			argv: ["workouts", "list", "--json"],
			env: { HEVY_API_KEY: "key", HEVY_CLI_LOG: "true" },
			streams: io.streams,
			clientFactory: () => mockClient(getWorkouts),
		});

		expect(code).toBe(0);
		expect(JSON.parse(io.err)).toMatchObject({
			event: "cli.command",
			outcome: "success",
			command: "workouts",
			subcommand: "list",
			exit_code: 0,
		});
		expect(io.out).toContain('"workouts":[]');
	});

	it("does not include raw arguments in structured CLI error logs", async () => {
		const io = streams();
		const privateValue = "private-workout-reference";
		const code = await runCli({
			argv: ["workouts", "list", "--page", privateValue],
			env: { HEVY_API_KEY: "key", HEVY_CLI_LOG: "true" },
			streams: io.streams,
			clientFactory: () => mockClient(vi.fn()),
		});
		const event = JSON.parse(io.err.split("\n", 1)[0] ?? "{}");

		expect(code).toBe(2);
		expect(event).toMatchObject({
			event: "cli.command",
			outcome: "failure",
			command: "workouts",
			subcommand: "list",
			exit_code: 2,
		});
		expect(io.err).not.toContain(privateValue);
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

	it("builds operations from the raw client and forwards execution options", async () => {
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
		expect(operationsClient).toBe(rawClient);
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
		createRoutine: vi.fn().mockResolvedValue({ routine: { id: "routine-1" } }),
		updateRoutine: vi.fn().mockResolvedValue({ routine: { id: "routine-1" } }),
		createExerciseTemplate: vi.fn().mockResolvedValue({ id: 2 }),
		createRoutineFolder: vi
			.fn()
			.mockResolvedValue({ routine_folder: { id: 3 } }),
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
				json({
					workout_id: "workout-1",
					workout: { ...workout.workout, is_private: false },
				}),
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
		expect(client.getBodyMeasurement).toHaveBeenCalledTimes(2);
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

describe("CLI JSON error_code compatibility", () => {
	const errorCases = [
		[
			"ApiError",
			new ApiError({
				status: 500,
				endpoint: "/v1/workouts",
				method: "GET",
				code: "HEVY_RETRY_EXHAUSTED",
			}),
			"HEVY_RETRY_EXHAUSTED",
			3,
		],
		[
			"NetworkError",
			new NetworkError({
				code: "ERR_NETWORK",
				endpoint: "/v1/workouts",
				method: "GET",
				retryExhausted: false,
			}),
			"ERR_NETWORK",
			4,
		],
		[
			"NotFoundError",
			new NotFoundError({
				status: 404,
				endpoint: "/v1/workouts/:workoutId",
				method: "GET",
				expected: false,
			}),
			undefined,
			3,
		],
		[
			"RateLimitError",
			new RateLimitError({
				status: 429,
				endpoint: "/v1/workouts",
				method: "GET",
			}),
			undefined,
			3,
		],
		[
			"ValidationError",
			new ValidationError({
				status: 400,
				endpoint: "/v1/workouts",
				method: "GET",
			}),
			undefined,
			3,
		],
		[
			"HevyHttpError",
			new HevyHttpError("request failed", {
				status: 503,
				method: "GET",
				endpoint: "/v1/workouts",
				code: "HEVY_RETRY_EXHAUSTED",
			}),
			"HEVY_RETRY_EXHAUSTED",
			3,
		],
		[
			"execution cancellation",
			new HevyHttpError("request canceled", {
				method: "GET",
				endpoint: "/v1/workouts",
				code: "HEVY_REQUEST_ABORTED",
				outcome: "cancelled",
			}),
			"HEVY_REQUEST_ABORTED",
			4,
		],
		[
			"execution deadline",
			new HevyHttpError("request deadline exceeded", {
				method: "GET",
				endpoint: "/v1/workouts",
				code: "HEVY_DEADLINE_EXCEEDED",
				outcome: "deadline_exceeded",
			}),
			"HEVY_DEADLINE_EXCEEDED",
			4,
		],
		["generic", new Error("ordinary failure"), undefined, 2],
		["string", "ordinary string failure", undefined, 2],
		[
			"hostile",
			new Error(
				"hostile-fake-secret Authorization Bearer fake-token should be redacted",
			),
			undefined,
			2,
		],
	] as const;

	it("omits error_code from successful JSON", async () => {
		const io = streams();
		const code = await runCli({
			argv: ["workouts", "list", "--json"],
			env: { HEVY_API_KEY: "fake-key" },
			clientFactory: () =>
				mockClient(
					vi.fn().mockResolvedValue({
						page: 1,
						page_count: 1,
						workouts: [],
					}),
				),
			streams: io.streams,
		});

		expect(code).toBe(0);
		expect(JSON.parse(io.out)).not.toHaveProperty("error_code");
		expect(io.err).toBe("");
	});

	it.each(errorCases)(
		"keeps the accepted error_code and exit family for %s",
		async (_name, error, expectedErrorCode, expectedExitCode) => {
			const io = streams();
			const createOperations = await createOperationsSpy();
			const actualCreateOperations = createOperations.getMockImplementation();
			if (actualCreateOperations === undefined) {
				throw new Error("Missing createOperations test implementation");
			}
			const baseline = actualCreateOperations(mockClient(vi.fn()));
			createOperations.mockImplementationOnce(() => ({
				...baseline,
				workouts: {
					...baseline.workouts,
					list: {
						...baseline.workouts.list,
						effect: () => Effect.fail(error as never),
					},
				},
			}));
			const code = await runCli({
				argv: ["workouts", "list", "--json"],
				env: { HEVY_API_KEY: "fake-key" },
				clientFactory: () => mockClient(vi.fn()),
				streams: io.streams,
			});
			const diagnostic = JSON.parse(io.err) as {
				readonly error_code?: string;
			};

			expect(code).toBe(expectedExitCode);
			if (expectedErrorCode === undefined) {
				expect(diagnostic).not.toHaveProperty("error_code");
			} else {
				expect(diagnostic).toHaveProperty("error_code", expectedErrorCode);
			}
			expect(io.out).toBe("");
			expect(io.err).not.toContain("Effect");
			expect(io.err).not.toContain("Cause");
			expect(io.err).not.toContain("Fiber");
			if (_name === "hostile") {
				expect(io.err).not.toContain("hostile-fake-secret");
				expect(io.err).not.toContain("fake-token");
			}
		},
	);
});

const REGRESSION_KEY = "00000000-0000-4000-8000-000000000000";

type Responder = (request: Request, attempt: number) => Response;

async function runWithFakeFetch(
	argv: string[],
	respond: Responder,
	options: {
		env?: Record<string, string>;
		execution?: { signal?: AbortSignal; deadline?: number };
	} = {},
) {
	let out = "";
	let err = "";
	const calls: string[] = [];
	let attempt = 0;
	const fakeFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		const url = new URL(request.url);
		calls.push(`${request.method} ${url.pathname}`);
		return Promise.resolve(respond(request, attempt++));
	}) as typeof fetch;
	const code = await runCli({
		argv,
		env: options.env ?? { HEVY_API_KEY: REGRESSION_KEY },
		execution: options.execution,
		streams: {
			stdout: (text) => {
				out += text;
			},
			stderr: (text) => {
				err += text;
			},
		},
		clientFactory: (apiKey) =>
			createHevyClient({
				apiKey,
				fetch: fakeFetch,
				sleep: async () => {},
			}),
	});
	return { code, out, err, calls };
}

const jsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

afterEach(() => {
	vi.useRealTimers();
});

describe("CLI regressions", () => {
	it("honors --json=true, which Stricli accepts as the --json flag", async () => {
		const result = await runWithFakeFetch(
			["workouts", "list", "--json=true"],
			() => jsonResponse({ page: 1, page_count: 1, workouts: [] }),
		);

		expect(result.code).toBe(0);
		// README: "Add --json to any command for machine-readable output."
		expect(result.out).toBe('{"page":1,"page_count":1,"workouts":[]}\n');
	});

	it("does not leak the internal expected404Outcome field from workouts get", async () => {
		const result = await runWithFakeFetch(
			["workouts", "get", "missing-id", "--json"],
			() => jsonResponse({ error: "Workout not found" }, 404),
		);

		// The other get commands strip operation internals; workouts get passes
		// the raw camelCase operation output straight to stdout.
		expect(result.out).not.toContain("expected404Outcome");
	});

	it.each([
		["workouts", "get", "missing-id"],
		["routines", "get", "missing-id"],
		["exercises", "get", "missing-id"],
		["measurements", "get", "2026-01-01"],
	])(
		"reports a missing resource from `%s %s` as an API failure (exit 3)",
		async (...argv) => {
			const result = await runWithFakeFetch([...argv, "--json"], () =>
				jsonResponse({ error: "not found" }, 404),
			);

			// main.test.ts expects NotFoundError on /v1/workouts/:workoutId to map
			// to exit 3, and `exercises history` 404 already exits 3.
			expect({ code: result.code, out: result.out }).toEqual({
				code: 3,
				out: "",
			});
		},
	);

	it("prints help for a bare `hevy` or route-map invocation without credentials", async () => {
		for (const argv of [[], ["workouts"]]) {
			const result = await runWithFakeFetch(argv, () => jsonResponse({}), {
				env: {},
			});
			// Route maps use defaultForRouteMap help; help is credential-free.
			expect({ argv, code: result.code, err: result.err }).toEqual({
				argv,
				code: 0,
				err: "",
			});
		}
	});

	it("reports user cancellation as a cancelled request", async () => {
		const result = await runWithFakeFetch(
			["user", "--json"],
			() => jsonResponse({}),
			{
				execution: {
					signal: AbortSignal.abort(
						new DOMException("CLI shutdown requested by SIGINT", "AbortError"),
					),
				},
			},
		);
		const failure = JSON.parse(result.err) as { message: string };

		expect(result.calls).toEqual([]);
		expect(failure.message).toBe("Hevy API request cancelled");
	});

	it("reports the CLI command deadline as a timeout", async () => {
		const result = await runWithFakeFetch(
			["user", "--json"],
			() => jsonResponse({}),
			{
				execution: { deadline: Date.now() - 1 },
			},
		);
		const failure = JSON.parse(result.err) as { message: string };

		expect(failure.message).toBe("Hevy API request timed out");
	});

	it("prints the training summary window the operation counted", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-11-06T15:00:00.000Z"));
		const workoutStart = "2026-10-31T08:00:00Z";
		const result = await runWithFakeFetch(
			["summary", "--weeks", "1", "--json"],
			(request) =>
				new URL(request.url).pathname === "/v1/workouts"
					? jsonResponse({
							page: 1,
							page_count: 1,
							workouts: [
								{
									id: "w1",
									title: "Morning",
									description: null,
									start_time: workoutStart,
									end_time: "2026-10-31T09:00:00Z",
									updated_at: "2026-10-31T09:00:00Z",
									created_at: "2026-10-31T09:00:00Z",
									exercises: [],
								},
							],
						})
					: jsonResponse({ page: 1, page_count: 1, body_measurements: [] }),
		);
		const summary = JSON.parse(result.out) as {
			start_date: string;
			end_date: string;
			workout_count: number;
		};
		const workoutDay = workoutStart.slice(0, 10);

		expect(summary.workout_count).toBe(1);
		expect(summary).toMatchObject({
			start_date: "2026-10-31",
			end_date: "2026-11-06",
		});
		expect(summary.start_date <= workoutDay).toBe(true);
		expect(workoutDay <= summary.end_date).toBe(true);
	});
});
