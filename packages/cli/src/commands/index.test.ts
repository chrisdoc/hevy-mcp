/* oxlint-disable typescript/unbound-method */
import type { HevyClient } from "@hevy-mcp/hevy-client";
import type { HevyOperations } from "@hevy-mcp/operations";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { CliArgs } from "../arguments.js";
import { createEffectClient } from "../test-fixtures/effect-client.js";
import { execute } from "./index.js";

const args = (
	command: string,
	subcommand?: string,
	positionals: readonly string[] = [],
	options: CliArgs["options"] = {},
): CliArgs => ({ command, subcommand, positionals: [...positionals], options });

function client(): HevyClient {
	return createEffectClient({
		getUserInfo: vi.fn().mockResolvedValue({ data: { id: "u1" } }),
		getWorkouts: vi
			.fn()
			.mockResolvedValue({ page: 1, page_count: 1, workouts: [] }),
		getWorkout: vi.fn().mockResolvedValue({ id: "w1" }),
		getWorkoutCount: vi.fn().mockResolvedValue({ workout_count: 4 }),
		getWorkoutEvents: vi
			.fn()
			.mockResolvedValue({ page: 1, page_count: 1, events: [] }),
		getRoutines: vi
			.fn()
			.mockResolvedValue({ page: 1, page_count: 1, routines: [] }),
		getRoutineById: vi.fn().mockResolvedValue({ routine: { id: "r1" } }),
		getExerciseTemplates: vi
			.fn()
			.mockResolvedValue({ page: 1, page_count: 1, exercise_templates: [] }),
		getExerciseTemplate: vi.fn().mockResolvedValue({ id: "e1" }),
		getExerciseHistory: vi.fn().mockResolvedValue({ exercise_history: [] }),
		getBodyMeasurements: vi
			.fn()
			.mockResolvedValue({ page: 1, page_count: 1, body_measurements: [] }),
		getBodyMeasurement: vi.fn().mockResolvedValue({ date: "2024-01-01" }),
		createWorkout: vi.fn(),
		updateWorkout: vi.fn(),
		createRoutine: vi.fn(),
		updateRoutine: vi.fn(),
		createExerciseTemplate: vi.fn(),
		getRoutineFolders: vi.fn(),
		createRoutineFolder: vi.fn(),
		getRoutineFolder: vi.fn(),
		createBodyMeasurement: vi.fn(),
		updateBodyMeasurement: vi.fn(),
	});
}

type OperationSafety = "read" | "non-idempotent-write" | "idempotent-write";

function operation<Id extends string, Safety extends OperationSafety, T>(
	id: Id,
	safety: Safety,
	value: T,
) {
	const effect = vi.fn(() => Effect.succeed(value));
	return {
		descriptor: { id, safety },
		effect,
		execute: vi.fn(),
	};
}

function asHevyOperations<T extends object>(fixture: T): T & HevyOperations {
	return fixture as T & HevyOperations;
}

function operations() {
	const templates = [{ id: "e1", title: "Bench Press" }];
	return asHevyOperations({
		routines: {
			create: operation("routines.create", "non-idempotent-write", {
				routine: { id: "r1" },
				usesRepRanges: false,
			}),
			get: operation("routines.get", "read", {
				routine: { id: "r1" },
			}),
			list: operation("routines.list", "read", {
				items: [{ id: "r1", title: "Push", exercises: [] }],
				page: 1,
				pageCount: undefined as number | undefined,
			}),
			search: operation("routines.search", "read", {
				routines: [],
				pages: 1,
				itemsScanned: 0,
			}),
			update: operation("routines.update", "idempotent-write", {
				routine: { id: "r1" },
				usesRepRanges: false,
			}),
		},
		workouts: {
			count: operation("workouts.count", "read", 4),
			create: operation("workouts.create", "non-idempotent-write", {
				id: "w1",
			}),
			events: operation("workouts.events", "read", {
				events: [],
				page: 1,
				pageCount: 1,
				since: "1970-01-01T00:00:00Z",
			}),
			get: operation("workouts.get", "read", { workout: { id: "w1" } }),
			list: operation("workouts.list", "read", {
				items: [],
				page: 1,
				pageCount: 1,
			}),
			replaceExercises: operation(
				"workouts.replaceExercises",
				"idempotent-write",
				{ id: "w1" },
			),
			update: operation("workouts.update", "idempotent-write", { id: "w1" }),
		},
		bodyMeasurements: {
			create: operation(
				"bodyMeasurements.create",
				"non-idempotent-write",
				"2024-01-01",
			),
			get: operation("bodyMeasurements.get", "read", {
				bodyMeasurement: { date: "2024-01-01" },
				date: "2024-01-01",
			}),
			list: operation("bodyMeasurements.list", "read", {
				items: [],
				page: 1,
				pageCount: 1,
			}),
			update: operation(
				"bodyMeasurements.update",
				"idempotent-write",
				"2024-01-01",
			),
		},
		folders: {
			create: operation("folders.create", "non-idempotent-write", {
				id: "folder-1",
			}),
			get: operation("folders.get", "read", {
				routineFolder: { id: "folder-1" },
				folderId: "folder-1",
			}),
			listAll: operation("folders.listAll", "read", []),
		},
		templates: {
			create: operation("templates.create", "non-idempotent-write", {
				id: "e2",
			}),
			get: operation("templates.get", "read", {
				exerciseTemplate: { id: "e1" },
				exerciseTemplateId: "e1",
			}),
			history: operation("templates.history", "read", {
				exerciseHistory: [],
				exerciseTemplateId: "e1",
			}),
			listAll: operation("templates.listAll", "read", templates),
			search: operation("templates.search", "read", {
				matches: templates,
				pages: 1,
				itemsScanned: templates.length,
				complete: true,
			}),
		},
		user: {
			get: operation("user.get", "read", { id: "u1" }),
		},
		workflows: {
			trainingSummary: operation("workflows.trainingSummary", "read", {
				period: {
					start_date: "2024-01-25",
					end_date: "2024-02-01",
					weeks: 1,
				},
				workouts: {
					count: 1,
					total_duration_seconds: 3_600,
					exercise_count: 2,
					set_count: 3,
					unique_exercise_template_ids: ["e1"],
					sessions: [],
				},
				body_measurements: { count: 0 },
				workflow: {
					name: "training-summary",
					pagination: { workouts: 1, body_measurements: 1 },
					cacheStatus: "not-used",
					itemsScanned: 1,
				},
			}),
		},
	});
}

const workout = {
	workout: {
		title: "Push",
		start_time: "2024-01-01T10:00:00Z",
		end_time: "2024-01-01T11:00:00Z",
		exercises: [
			{
				exercise_template_id: "exercise-1",
				sets: [{ type: "normal", weight_kg: 50, reps: 5 }],
			},
		],
	},
};
const routine = {
	routine: {
		title: "Strength",
		exercises: [
			{
				exercise_template_id: "exercise-1",
				sets: [{ type: "normal", reps: 5 }],
			},
		],
	},
};
type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { readonly [key: string]: JsonValue };

const mutationOptions = (data: JsonObject): CliArgs["options"] => ({
	data: JSON.stringify(data),
	yes: true,
});

describe("execute command/operation mappings", () => {
	it("uses the injected routines list operation while retaining the page envelope", async () => {
		const api = client();
		const injected = operations();
		const listEffect = injected.routines.list.effect;
		listEffect.mockReturnValue(
			Effect.succeed({
				items: [{ id: "r1", title: "Push", exercises: [] }],
				page: 2,
				pageCount: 3,
			}),
		);

		await expect(
			execute(
				args("routines", "list", [], { page: "2" }),
				api,
				undefined,
				undefined,
				injected,
			),
		).resolves.toEqual({
			page: 2,
			page_count: 3,
			routines: [{ id: "r1", title: "Push", exercises: [] }],
		});
		expect(listEffect).toHaveBeenCalledWith({ page: 2, pageSize: 5 });
		expect(injected.routines.list.execute).not.toHaveBeenCalled();
		expect(api.getRoutines).not.toHaveBeenCalled();

		listEffect.mockReturnValue(
			Effect.succeed({
				items: [],
				page: 2,
				pageCount: undefined,
				expected404Outcome: "end_of_list",
			}),
		);
		await expect(
			execute(
				args("routines", "list", [], { page: "2" }),
				api,
				undefined,
				undefined,
				injected,
			),
		).resolves.toEqual({ page: 2, page_count: 0, routines: [] });
	});

	it("[VAL-CLI-002] uses workouts.list.effect instead of the Promise client", async () => {
		const api = client();
		const injected = operations();
		await execute(
			args("workouts", "list", [], { page: "1", "page-size": "10" }),
			api,
			undefined,
			undefined,
			injected,
		);
		expect(injected.workouts.list.effect).toHaveBeenCalledWith({
			page: 1,
			pageSize: 10,
		});
		expect(injected.workouts.list.execute).not.toHaveBeenCalled();
		expect(api.getWorkouts).not.toHaveBeenCalled();
	});

	it.each([
		{
			name: "user",
			args: args("user"),
			operation: (value: HevyOperations) => value.user?.get,
			clientMethod: "getUserInfo",
		},
		{
			name: "workouts get",
			args: args("workouts", "get", ["w1"]),
			operation: (value: HevyOperations) => value.workouts.get,
			clientMethod: "getWorkout",
		},
		{
			name: "workouts count",
			args: args("workouts", "count"),
			operation: (value: HevyOperations) => value.workouts.count,
			clientMethod: "getWorkoutCount",
		},
		{
			name: "workouts events",
			args: args("workouts", "events"),
			operation: (value: HevyOperations) => value.workouts.events,
			clientMethod: "getWorkoutEvents",
		},
		{
			name: "routines get",
			args: args("routines", "get", ["r1"]),
			operation: (value: HevyOperations) => value.routines.get,
			clientMethod: "getRoutineById",
		},
		{
			name: "exercises get",
			args: args("exercises", "get", ["e1"]),
			operation: (value: HevyOperations) => value.templates?.get,
			clientMethod: "getExerciseTemplate",
		},
		{
			name: "exercises history",
			args: args("exercises", "history", ["e1"]),
			operation: (value: HevyOperations) => value.templates?.history,
			clientMethod: "getExerciseHistory",
		},
		{
			name: "exercises search",
			args: args("exercises", "search", ["bench"]),
			operation: (value: HevyOperations) => value.templates?.search,
			clientMethod: "getExerciseTemplates",
		},
		{
			name: "measurements list",
			args: args("measurements", "list"),
			operation: (value: HevyOperations) => value.bodyMeasurements?.list,
			clientMethod: "getBodyMeasurements",
		},
		{
			name: "measurements get",
			args: args("measurements", "get", ["2024-01-01"]),
			operation: (value: HevyOperations) => value.bodyMeasurements?.get,
			clientMethod: "getBodyMeasurement",
		},
		{
			name: "summary",
			args: args("summary"),
			operation: (value: HevyOperations) => value.workflows?.trainingSummary,
			clientMethod: "getWorkouts",
		},
	] as const)(
		"maps %s to an operation, not %s",
		async ({ args: commandArgs, operation: getOperation, clientMethod }) => {
			const api = client();
			const injected = operations();
			await execute(commandArgs, api, undefined, undefined, injected);
			expect(getOperation(injected)?.effect).toHaveBeenCalled();
			expect(getOperation(injected)?.execute).not.toHaveBeenCalled();
			expect(api[clientMethod]).not.toHaveBeenCalled();
		},
	);

	it("[VAL-CLI-009] forwards execution options to every operation effect", async () => {
		const api = client();
		const injected = operations();
		const execution = {
			signal: new AbortController().signal,
			deadline: Date.now() + 1_000,
			timeoutMs: 321,
		};
		const calls: Array<{
			args: CliArgs;
			operation: () =>
				| { readonly effect: ReturnType<typeof vi.fn> }
				| undefined;
			input?: unknown;
		}> = [
			{ args: args("user"), operation: () => injected.user?.get },
			{
				args: args("workouts", "get", ["w1"]),
				operation: () => injected.workouts.get,
				input: { workoutId: "w1" },
			},
			{
				args: args("workouts", "list"),
				operation: () => injected.workouts.list,
				input: { page: 1, pageSize: 5 },
			},
			{
				args: args("workouts", "count"),
				operation: () => injected.workouts.count,
			},
			{
				args: args("workouts", "events"),
				operation: () => injected.workouts.events,
				input: {
					page: 1,
					pageSize: 5,
					since: "1970-01-01T00:00:00Z",
				},
			},
			{
				args: args("routines", "get", ["r1"]),
				operation: () => injected.routines.get,
				input: { routineId: "r1" },
			},
			{
				args: args("exercises", "get", ["e1"]),
				operation: () => injected.templates?.get,
				input: { exerciseTemplateId: "e1" },
			},
			{
				args: args("exercises", "history", ["e1"]),
				operation: () => injected.templates?.history,
				input: { exerciseTemplateId: "e1" },
			},
			{
				args: args("exercises", "search", ["bench"]),
				operation: () => injected.templates?.search,
				input: { query: "bench", maxPages: 10 },
			},
			{
				args: args("measurements", "list"),
				operation: () => injected.bodyMeasurements?.list,
				input: { page: 1, pageSize: 5 },
			},
			{
				args: args("measurements", "get", ["2024-01-01"]),
				operation: () => injected.bodyMeasurements?.get,
				input: { date: "2024-01-01" },
			},
			{
				args: args("summary"),
				operation: () => injected.workflows?.trainingSummary,
				input: { weeks: 1 },
			},
		];

		for (const call of calls) {
			await execute(call.args, api, undefined, undefined, injected, execution);
			const effect = call.operation()?.effect;
			if (call.input === undefined) {
				expect(effect).toHaveBeenCalledWith(execution);
			} else {
				expect(effect).toHaveBeenCalledWith(call.input, execution);
			}
		}
	});

	it("[VAL-CLI-004] routes every mutation through its operation effect", async () => {
		const api = client();
		const injected = operations();
		const commands = [
			{
				args: args("workouts", "create", [], mutationOptions(workout)),
				operation: injected.workouts.create,
				input: {
					workout: {
						...workout.workout,
						is_private: false,
					},
				},
				clientMethod: "createWorkout",
			},
			{
				args: args(
					"workouts",
					"update",
					["w1"],
					mutationOptions({ workout_id: "w1", ...workout }),
				),
				operation: injected.workouts.update,
				input: {
					workoutId: "w1",
					workout: { ...workout.workout, is_private: false },
				},
				clientMethod: "updateWorkout",
			},
			{
				args: args("routines", "create", [], mutationOptions(routine)),
				operation: injected.routines.create,
				input: routine,
				clientMethod: "createRoutine",
			},
			{
				args: args(
					"routines",
					"update",
					["r1"],
					mutationOptions({ routine_id: "r1", ...routine }),
				),
				operation: injected.routines.update,
				input: { routineId: "r1", routine: routine.routine },
				clientMethod: "updateRoutine",
			},
			{
				args: args(
					"exercises",
					"create",
					[],
					mutationOptions({
						exercise: {
							title: "Cable Row",
							exercise_type: "weight_reps",
							equipment_category: "machine",
							muscle_group: "upper_back",
						},
					}),
				),
				operation: injected.templates?.create,
				input: {
					exercise: {
						title: "Cable Row",
						exercise_type: "weight_reps",
						equipment_category: "machine",
						muscle_group: "upper_back",
						other_muscles: [],
					},
				},
				clientMethod: "createExerciseTemplate",
			},
			{
				args: args(
					"folders",
					"create",
					[],
					mutationOptions({ routine_folder: { title: "Strength" } }),
				),
				operation: injected.folders?.create,
				input: { routine_folder: { title: "Strength" } },
				clientMethod: "createRoutineFolder",
			},
			{
				args: args(
					"measurements",
					"create",
					["2024-01-01"],
					mutationOptions({ date: "2024-01-01", weight_kg: 80 }),
				),
				operation: injected.bodyMeasurements?.create,
				input: { date: "2024-01-01", weight_kg: 80 },
				clientMethod: "createBodyMeasurement",
			},
			{
				args: args(
					"measurements",
					"update",
					["2024-01-01"],
					mutationOptions({ date: "2024-01-01", weight_kg: 81 }),
				),
				operation: injected.bodyMeasurements?.update,
				input: { date: "2024-01-01", weight_kg: 81 },
				clientMethod: "updateBodyMeasurement",
			},
		] as const;

		for (const command of commands) {
			await execute(command.args, api, undefined, undefined, injected);
			expect(command.operation?.effect).toHaveBeenCalledWith(command.input);
			expect(command.operation?.execute).not.toHaveBeenCalled();
			expect(api[command.clientMethod]).not.toHaveBeenCalled();
		}
	});

	it("preserves search and summary output projections", async () => {
		const api = client();
		const injected = operations();
		const templates = [{ id: "e1", title: "Bench Press" }];
		injected.templates?.search.effect.mockReturnValue(
			Effect.succeed({
				matches: templates,
				pages: 1,
				itemsScanned: templates.length,
				complete: true,
			}),
		);
		await expect(
			execute(
				args("exercises", "search", ["bench"]),
				api,
				undefined,
				undefined,
				injected,
			),
		).resolves.toMatchObject({
			query: "bench",
			matches: templates,
			pages_scanned: 1,
			complete: true,
		});

		await expect(
			execute(
				args("summary"),
				api,
				() => new Date("2024-02-01T00:00:00Z"),
				undefined,
				injected,
			),
		).resolves.toMatchObject({
			weeks: 1,
			workout_count: 1,
			total_duration_seconds: 3_600,
			exercise_count: 2,
			set_count: 3,
			pages_scanned: 1,
			complete: true,
		});
	});

	it("preserves existing measurement fields in update output", async () => {
		const api = client();
		const injected = operations();
		injected.bodyMeasurements?.get.effect.mockReturnValue(
			Effect.succeed({
				bodyMeasurement: {
					date: "2024-01-01",
					weight_kg: 80,
					fat_percent: 20,
				},
				date: "2024-01-01",
			}),
		);

		await expect(
			execute(
				args(
					"measurements",
					"update",
					["2024-01-01"],
					mutationOptions({
						date: "2024-01-01",
						weight_kg: 81,
						fat_percent: null,
					}),
				),
				api,
				undefined,
				undefined,
				injected,
			),
		).resolves.toEqual({
			body_measurement: {
				date: "2024-01-01",
				weight_kg: 81,
				fat_percent: 20,
			},
		});
		expect(injected.bodyMeasurements?.get.effect).toHaveBeenCalledWith({
			date: "2024-01-01",
		});
		expect(injected.bodyMeasurements?.update.effect).toHaveBeenCalledWith({
			date: "2024-01-01",
			weight_kg: 81,
			fat_percent: 20,
		});
	});

	it("rejects malformed existing measurements before updating", async () => {
		const api = client();
		const injected = operations();
		injected.bodyMeasurements?.get.effect.mockReturnValue(
			Effect.succeed({
				bodyMeasurement: {
					date: "2024-01-01",
					weight_kg: "invalid",
				},
				date: "2024-01-01",
			}),
		);

		await expect(
			execute(
				args(
					"measurements",
					"update",
					["2024-01-01"],
					mutationOptions({
						date: "2024-01-01",
						weight_kg: 81,
					}),
				),
				api,
				undefined,
				undefined,
				injected,
			),
		).rejects.toThrow("The API returned an invalid body measurement");
		expect(injected.bodyMeasurements?.update.effect).not.toHaveBeenCalled();
	});
});
