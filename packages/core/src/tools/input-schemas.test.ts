import { describe, expect, it } from "vitest";
import { createRoutineInputSchema, workoutInputSchema } from "../mutations.js";

describe("snake_case mutation schemas", () => {
	it("parses an API-shaped workout envelope and materializes defaults", () => {
		const parsed = workoutInputSchema.parse({
			workout: {
				title: "Push",
				start_time: "2026-07-29T08:00:00Z",
				end_time: "2026-07-29T09:00:00Z",
				exercises: [
					{
						exercise_template_id: "bench",
						sets: [{ type: "normal", weight_kg: "50" }],
					},
				],
			},
		});

		expect(parsed.workout.is_private).toBe(false);
		expect(parsed.workout.exercises[0]?.sets[0]?.weight_kg).toBe(50);
	});

	it("rejects wrapperless and legacy camelCase mutation shapes", () => {
		expect(
			workoutInputSchema.safeParse({
				title: "Push",
				startTime: "2026-07-29T08:00:00Z",
				endTime: "2026-07-29T09:00:00Z",
				exercises: [],
			}).success,
		).toBe(false);
		expect(
			workoutInputSchema.safeParse({
				workout: {
					title: "Push",
					startTime: "2026-07-29T08:00:00Z",
					endTime: "2026-07-29T09:00:00Z",
					exercises: [],
				},
			}).success,
		).toBe(false);
	});

	it("reports useful nested paths for unknown keys", () => {
		const result = workoutInputSchema.safeParse({
			workout: {
				title: "Push",
				start_time: "2026-07-29T08:00:00Z",
				end_time: "2026-07-29T09:00:00Z",
				exercises: [
					{
						exercise_template_id: "bench",
						sets: [{ type: "normal", weightKg: 50 }],
					},
				],
			},
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual([
				"workout",
				"exercises",
				0,
				"sets",
				0,
			]);
			expect(result.error.issues[0]?.message).toContain("Unrecognized key");
		}
	});

	it("accepts API rep_range and rejects unsupported range or RPE values", () => {
		expect(
			createRoutineInputSchema.safeParse({
				routine: {
					title: "Push",
					exercises: [
						{
							exercise_template_id: "bench",
							sets: [{ type: "normal", rep_range: { start: 8, end: 10 } }],
						},
					],
				},
			}).success,
		).toBe(true);
		expect(
			createRoutineInputSchema.safeParse({
				routine: {
					title: "Push",
					exercises: [
						{
							exercise_template_id: "bench",
							sets: [{ type: "normal", rep_range: { minimum: 8 } }],
						},
					],
				},
			}).success,
		).toBe(false);
	});
});
