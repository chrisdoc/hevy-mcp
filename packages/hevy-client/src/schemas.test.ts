import { describe, expect, it } from "vitest";
import {
	bodyMeasurementSchema,
	getV1BodyMeasurementsDatePathParamsSchema,
	getV1BodyMeasurementsQueryParamsSchema,
	getV1ExerciseHistoryExercisetemplateidPathParamsSchema,
	getV1ExerciseHistoryExercisetemplateidQueryParamsSchema,
	getV1RoutinesQueryParamsSchema,
	getV1RoutinesRoutineidPathParamsSchema,
	getV1WorkoutsEventsQueryParamsSchema,
	getV1WorkoutsQueryParamsSchema,
	getV1WorkoutsWorkoutidPathParamsSchema,
} from "./schemas.js";

describe("curated client schema exports", () => {
	it("parses representative CLI query and path contracts", () => {
		expect(
			getV1WorkoutsQueryParamsSchema.parse({ page: "2", pageSize: "5" }),
		).toMatchObject({
			page: 2,
			pageSize: 5,
		});
		expect(
			getV1WorkoutsEventsQueryParamsSchema.parse({
				since: "2024-01-01T00:00:00Z",
			}),
		).toMatchObject({ since: "2024-01-01T00:00:00Z" });
		expect(getV1RoutinesQueryParamsSchema.parse({ page: "1" })).toMatchObject({
			page: 1,
		});
		expect(
			getV1BodyMeasurementsQueryParamsSchema.parse({ page: "1" }),
		).toMatchObject({
			page: 1,
		});
		expect(
			getV1ExerciseHistoryExercisetemplateidQueryParamsSchema.parse({
				start_date: "2024-01-01T00:00:00Z",
			}),
		).toEqual({ start_date: "2024-01-01T00:00:00Z" });
		expect(
			getV1WorkoutsWorkoutidPathParamsSchema.parse({ workoutId: "workout-1" }),
		).toEqual({ workoutId: "workout-1" });
		expect(
			getV1ExerciseHistoryExercisetemplateidPathParamsSchema.parse({
				exerciseTemplateId: "exercise-1",
			}),
		).toEqual({ exerciseTemplateId: "exercise-1" });
		expect(
			getV1RoutinesRoutineidPathParamsSchema.parse({ routineId: "routine-1" }),
		).toEqual({ routineId: "routine-1" });
		expect(
			getV1BodyMeasurementsDatePathParamsSchema.parse({ date: "2024-02-29" }),
		).toEqual({ date: "2024-02-29" });
		expect(
			bodyMeasurementSchema.parse({ date: "2024-02-29", weight_kg: 80 }),
		).toMatchObject({ date: "2024-02-29", weight_kg: 80 });
	});
});
