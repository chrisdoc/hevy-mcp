import { describe, expect, it } from "vitest";
import type { Routine, Workout } from "@hevy-mcp/hevy-client/types";
import {
	calculateDuration,
	normalizeBodyMeasurement,
	normalizeExerciseHistoryEntry,
	projectRoutine,
	projectRoutineFolder,
	projectWorkout,
} from "./response-contracts.js";

describe("snake_case response projections", () => {
	it("projects workouts without camelCase members", () => {
		const result = projectWorkout({
			id: "workout-1",
			routine_id: "routine-1",
			start_time: "2025-01-01T10:00:00Z",
			end_time: "2025-01-01T11:00:00Z",
			exercises: [
				{
					title: "Bench Press",
					exercise_template_id: "bench",
					supersets_id: 2,
					sets: [{ weight_kg: 80, reps: 8 }],
				},
			],
		} satisfies Workout);

		expect(result).toEqual({
			id: "workout-1",
			routine_id: "routine-1",
			start_time: "2025-01-01T10:00:00Z",
			end_time: "2025-01-01T11:00:00Z",
			duration: "1h 0m 0s",
			exercises: [
				{
					title: "Bench Press",
					exercise_template_id: "bench",
					supersets_id: 2,
					sets: [{ weight_kg: 80, reps: 8 }],
				},
			],
		});
	});

	it("projects routines and preserves rep-range semantics", () => {
		const result = projectRoutine({
			id: "routine-1",
			folder_id: 4,
			exercises: [
				{
					exercise_template_id: "bench",
					rest_seconds: 60,
					sets: [{ rep_range: { start: 8, end: 12 } }],
				},
			],
		} satisfies Routine);

		expect(result).toEqual({
			id: "routine-1",
			folder_id: 4,
			exercises: [
				{
					exercise_template_id: "bench",
					rest_seconds: 60,
					sets: [{ rep_range: { start: 8, end: 12 } }],
				},
			],
		});
	});

	it("normalizes generated history and measurement DTOs without recasing", () => {
		expect(
			normalizeExerciseHistoryEntry({
				workout_id: "w1",
				exercise_template_id: "bench",
				weight_kg: 80,
				set_type: "normal",
			}),
		).toEqual({
			workout_id: "w1",
			exercise_template_id: "bench",
			weight_kg: 80,
			set_type: "normal",
		});
		expect(
			normalizeBodyMeasurement({ date: "2025-01-01", weight_kg: 80 }),
		).toEqual({ date: "2025-01-01", weight_kg: 80 });
		expect(projectRoutineFolder({ id: 1, title: "Strength" })).toEqual({
			id: 1,
			title: "Strength",
		});
	});

	it("handles invalid and missing workout timestamps safely", () => {
		expect(calculateDuration(undefined, undefined)).toBe("Unknown duration");
		expect(
			calculateDuration("2025-01-01T11:00:00Z", "2025-01-01T10:00:00Z"),
		).toBe("Invalid duration (end time before start time)");
	});
});
