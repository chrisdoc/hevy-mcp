import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@hevy-mcp/hevy-client";

import {
	createRoutinesGetOperation,
	createRoutinesListOperation,
} from "./routines.js";
import {
	createWorkoutsCountOperation,
	createWorkoutsCreateOperation,
	createWorkoutsReplaceExercisesOperation,
	createWorkoutsUpdateOperation,
	createWorkoutsGetOperation,
	createWorkoutsListOperation,
} from "./workouts.js";
import { PaginationMismatchError } from "./operation-errors.js";

function assertEffectProgram(program: Effect.Effect<unknown, unknown>): void {
	expect(program).not.toBeInstanceOf(Promise);
	expect(program).toHaveProperty("pipe");
	expect(program).not.toHaveProperty("then");
}

function assertExecuteAdapter(source: string): void {
	expect(source.match(/Effect\.runPromise/g)).toHaveLength(1);
	expect(source).not.toMatch(/Effect\.(catch|catchIf|map|tryPromise|promise)/);
	expect(source).not.toMatch(/while\s*\(/);
}

describe("operations Effect collapse", () => {
	it("exposes workouts.get as an Effect program", () => {
		const operation = createWorkoutsGetOperation({
			getWorkout: () => Effect.succeed({}),
		});

		assertEffectProgram(operation.effect({ workoutId: "workout-1" }));
	});

	it("exposes workouts.list as an Effect program", () => {
		const operation = createWorkoutsListOperation({
			getWorkouts: () => Effect.succeed({ workouts: [] }),
		});

		assertEffectProgram(operation.effect({ page: 1, pageSize: 5 }));
	});

	it("exposes routines.get as an Effect program", () => {
		const operation = createRoutinesGetOperation({
			getRoutineById: () => Effect.succeed({}),
		});

		assertEffectProgram(operation.effect({ routineId: "routine-1" }));
	});

	it("exposes routines.list as an Effect program", () => {
		const operation = createRoutinesListOperation({
			getRoutines: () => Effect.succeed({ routines: [] }),
		});

		assertEffectProgram(operation.effect({ page: 1, pageSize: 5 }));
	});

	it("keeps execute as a single Promise collapse of the Effect program", () => {
		const operations = [
			createWorkoutsCreateOperation({
				createWorkout: () => Effect.succeed({}),
			}),
			createWorkoutsUpdateOperation({
				getWorkout: () => Effect.succeed({}),
				updateWorkout: () => Effect.succeed({}),
			}),
			createWorkoutsReplaceExercisesOperation({
				getWorkout: () => Effect.succeed({}),
				updateWorkout: () => Effect.succeed({}),
			}),
			createWorkoutsCountOperation({
				getWorkoutCount: () => Effect.succeed({}),
			}),
			createWorkoutsGetOperation({
				getWorkout: () => Effect.succeed({}),
			}),
			createWorkoutsListOperation({
				getWorkouts: () => Effect.succeed({ workouts: [] }),
			}),
			createRoutinesGetOperation({
				getRoutineById: () => Effect.succeed({}),
			}),
			createRoutinesListOperation({
				getRoutines: () => Effect.succeed({ routines: [] }),
			}),
		];

		for (const operation of operations) {
			assertExecuteAdapter(operation.execute.toString());
		}
	});

	it("runs the Effect program at the test edge without a Promise hop", async () => {
		const getWorkout = vi.fn(() => Effect.succeed({ id: "workout-1" }));
		const operation = createWorkoutsGetOperation({ getWorkout });

		await expect(
			Effect.runPromise(operation.effect({ workoutId: "workout-1" })),
		).resolves.toEqual({
			workout: { id: "workout-1" },
		});

		const seamResult = getWorkout.mock.results[0]?.value;
		expect(seamResult).toBeDefined();
		await expect(Effect.runPromise(seamResult)).resolves.toEqual({
			id: "workout-1",
		});
	});

	it("keeps tagged recovery and domain mapping inside effect", async () => {
		const operation = createWorkoutsGetOperation({
			getWorkout: () =>
				Effect.fail(
					new NotFoundError({
						status: 404,
						method: "GET",
						endpoint: "/v1/workouts/workout-1",
						expected: true,
					}),
				),
		});

		await expect(
			Effect.runPromise(operation.effect({ workoutId: "workout-1" })),
		).resolves.toEqual({
			workout: null,
			expected404Outcome: "not_found",
		});
	});

	it("fails page mismatches through a tagged domain error", async () => {
		const operation = createWorkoutsListOperation({
			getWorkouts: () =>
				Effect.succeed({
					page: 3,
					workouts: [],
				}),
		});

		const error = await Effect.runPromise(
			Effect.flip(operation.effect({ page: 2, pageSize: 5 })),
		);

		expect(error).toBeInstanceOf(PaginationMismatchError);
		expect(error).toMatchObject({
			_tag: "PaginationMismatchError",
			requested: 2,
			received: 3,
			collection: "workouts",
		});
	});
});
