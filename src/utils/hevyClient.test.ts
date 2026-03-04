import { describe, expect, it } from "vitest";
import { createClient } from "./hevyApiClient";

describe("hevyApiClient", () => {
	describe("createClient", () => {
		it("should create a client with the correct configuration", () => {
			// Arrange
			const apiKey = "test-api-key";
			const baseUrl = "https://api.hevy.com";

			// Act
			const client = createClient(apiKey, baseUrl);

			// Assert
			expect(client).toMatchObject({
				getWorkouts: expect.any(Function),
				getWorkout: expect.any(Function),
				createWorkout: expect.any(Function),
				updateWorkout: expect.any(Function),
				getWorkoutCount: expect.any(Function),
				getWorkoutEvents: expect.any(Function),
				getRoutines: expect.any(Function),
				getRoutineById: expect.any(Function),
				createRoutine: expect.any(Function),
				updateRoutine: expect.any(Function),
				getExerciseTemplates: expect.any(Function),
				getExerciseTemplate: expect.any(Function),
				getExerciseHistory: expect.any(Function),
				createExerciseTemplate: expect.any(Function),
				getRoutineFolders: expect.any(Function),
				getRoutineFolder: expect.any(Function),
				createRoutineFolder: expect.any(Function),
			});
		});
	});
});
