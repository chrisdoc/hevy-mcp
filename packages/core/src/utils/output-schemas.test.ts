import { describe, expect, it } from "vitest";
import {
	formattedBodyMeasurementSchema,
	formattedExerciseHistoryEntrySchema,
	formattedExerciseTemplateSchema,
	formattedRoutineFolderSchema,
	formattedRoutineSchema,
	formattedWorkoutSchema,
	workoutEventsResponse,
} from "./response-contracts.js";

describe("snake_case formatted output schemas", () => {
	it("accepts generated-aligned workout and routine projections", () => {
		expect(
			formattedWorkoutSchema.parse({
				id: "workout-1",
				routine_id: "routine-1",
				start_time: "2025-01-01T10:00:00Z",
				duration: "1h 0m 0s",
			}),
		).toMatchObject({ routine_id: "routine-1" });
		expect(
			formattedRoutineSchema.parse({
				id: "routine-1",
				folder_id: 2,
				exercises: [{ rest_seconds: 60 }],
			}),
		).toMatchObject({ folder_id: 2, exercises: [{ rest_seconds: 60 }] });
	});

	it("accepts snake_case template, history, measurement, and folder DTOs", () => {
		expect(
			formattedExerciseTemplateSchema.parse({
				id: "bench",
				primary_muscle_group: "chest",
			}),
		).toEqual({ id: "bench", primary_muscle_group: "chest" });
		expect(
			formattedExerciseHistoryEntrySchema.parse({
				workout_id: "workout-1",
				weight_kg: 80,
			}),
		).toEqual({ workout_id: "workout-1", weight_kg: 80 });
		expect(
			formattedBodyMeasurementSchema.parse({
				date: "2025-01-01",
				weight_kg: 80,
			}),
		).toEqual({ date: "2025-01-01", weight_kg: 80 });
		expect(
			formattedRoutineFolderSchema.parse({ id: 1, title: "Strength" }),
		).toEqual({
			id: 1,
			title: "Strength",
		});
	});

	it("uses snake_case pagination and event members", () => {
		const response = workoutEventsResponse.render({
			events: [],
			since: "2025-01-01T00:00:00Z",
			page: 2,
		});
		expect(response.structuredContent).toEqual({
			events: [],
			page: 2,
			page_count: undefined,
			has_next_page: undefined,
		});
	});
});
