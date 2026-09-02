import { describe, expect, it } from "vitest";
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
});
