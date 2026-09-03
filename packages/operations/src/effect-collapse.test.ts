import { describe, expect, it, vi } from "vitest";
import { Effect } from "effect";

import {
	createRoutinesGetOperation,
	createRoutinesListOperation,
} from "./routines.js";
import {
	createWorkoutsGetOperation,
	createWorkoutsListOperation,
} from "./workouts.js";

function assertCollapsedExecute(source: string): void {
	expect(source.match(/Effect\.runPromise/g)).toHaveLength(1);
	expect(source).not.toMatch(/Effect\.(tryPromise|promise)/);
	expect(source).toContain("Effect.catchIf");
}

describe("operations Effect collapse", () => {
	it("collapses workouts.get onto one Effect boundary", () => {
		const operation = createWorkoutsGetOperation({
			getWorkout: () => Effect.succeed({}),
		});

		assertCollapsedExecute(operation.execute.toString());
	});

	it("collapses workouts.list onto one Effect boundary", () => {
		const operation = createWorkoutsListOperation({
			getWorkouts: () => Effect.succeed({ workouts: [] }),
		});

		assertCollapsedExecute(operation.execute.toString());
	});

	it("collapses routines.get onto one Effect boundary", () => {
		const operation = createRoutinesGetOperation({
			getRoutineById: () => Effect.succeed({}),
		});

		assertCollapsedExecute(operation.execute.toString());
	});

	it("collapses routines.list onto one Effect boundary", () => {
		const operation = createRoutinesListOperation({
			getRoutines: () => Effect.succeed({ routines: [] }),
		});

		assertCollapsedExecute(operation.execute.toString());
	});

	it("passes an Effect-capable read seam directly into execute", async () => {
		const getWorkout = vi.fn(() => Effect.succeed({ id: "workout-1" }));
		const operation = createWorkoutsGetOperation({ getWorkout });

		await expect(
			operation.execute({ workoutId: "workout-1" }),
		).resolves.toEqual({
			workout: { id: "workout-1" },
		});

		const seamResult = getWorkout.mock.results[0]?.value;
		expect(seamResult).toBeDefined();
		await expect(Effect.runPromise(seamResult)).resolves.toEqual({
			id: "workout-1",
		});
	});
});
