/* oxlint-disable typescript/unbound-method */
import { HevyHttpError, type HevyClient } from "@hevy-mcp/hevy-client";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "./main.js";

const mockClient = (getWorkouts: HevyClient["getWorkouts"]): HevyClient => {
	const client = Object.create(null) as HevyClient;
	client.getWorkouts = getWorkouts;
	return client;
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
});

function mutationClient(): HevyClient {
	const client = Object.create(null) as HevyClient;
	client.createWorkout = vi.fn().mockResolvedValue({ id: "workout-1" });
	client.updateWorkout = vi.fn().mockResolvedValue({ id: "workout-1" });
	client.createRoutine = vi.fn().mockResolvedValue({ id: "routine-1" });
	client.updateRoutine = vi.fn().mockResolvedValue({ id: "routine-1" });
	client.createExerciseTemplate = vi.fn().mockResolvedValue({ id: 2 });
	client.createRoutineFolder = vi.fn().mockResolvedValue({ id: 3 });
	client.createBodyMeasurement = vi.fn().mockResolvedValue({
		date: "2024-01-02",
		weight_kg: 80,
	});
	client.getBodyMeasurement = vi.fn().mockResolvedValue({
		date: "2024-01-02",
		weight_kg: 80,
	});
	client.updateBodyMeasurement = vi.fn().mockResolvedValue({
		date: "2024-01-02",
		weight_kg: 81,
	});
	return client;
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
		const routine = { routine: { title: "Strength", exercises: [] } };
		const json = (value: unknown) => JSON.stringify(value);
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
});
