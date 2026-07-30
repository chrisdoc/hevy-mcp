import { describe, expect, it } from "vitest";
import {
	createRoutineInputSchema,
	replaceWorkoutExercisesInputSchema,
	updateWorkoutInputSchema,
	workoutInputSchema,
} from "../mutations.js";

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

	it("parses independent workout metadata patch fields", () => {
		expect(
			updateWorkoutInputSchema.parse({
				workout_id: "w1",
				workout: { title: "Renamed" },
			}).workout,
		).toEqual({ title: "Renamed" });
		expect(
			updateWorkoutInputSchema.parse({
				workout_id: "w1",
				workout: { description: "Notes" },
			}).workout,
		).toEqual({ description: "Notes" });
		expect(
			updateWorkoutInputSchema.parse({
				workout_id: "w1",
				workout: { start_time: "2026-07-29T08:00:00Z" },
			}).workout,
		).toEqual({ start_time: "2026-07-29T08:00:00Z" });
		expect(
			updateWorkoutInputSchema.parse({
				workout_id: "w1",
				workout: { end_time: "2026-07-29T09:00:00Z" },
			}).workout,
		).toEqual({ end_time: "2026-07-29T09:00:00Z" });
		expect(
			updateWorkoutInputSchema.parse({
				workout_id: "w1",
				workout: { is_private: false },
			}).workout,
		).toEqual({ is_private: false });
	});

	it("retains explicit null and false patch values", () => {
		expect(
			updateWorkoutInputSchema.parse({
				workout_id: "w1",
				workout: { description: null, is_private: false },
			}).workout,
		).toEqual({ description: null, is_private: false });
	});

	it("requires strict UTC-second timestamps in metadata patches", () => {
		expect(
			updateWorkoutInputSchema.safeParse({
				workout_id: "w1",
				workout: { start_time: "2026-07-29T08:00Z" },
			}).success,
		).toBe(false);
		expect(
			updateWorkoutInputSchema.safeParse({
				workout_id: "w1",
				workout: { end_time: "2026-07-29T09:00:00+00:00" },
			}).success,
		).toBe(false);
		expect(
			updateWorkoutInputSchema.safeParse({
				workout_id: "w1",
				workout: { start_time: "2026-07-29T08:00:00Z" },
			}).success,
		).toBe(true);
	});

	it("rejects empty and non-metadata workout patches", () => {
		const empty = updateWorkoutInputSchema.safeParse({
			workout_id: "w1",
			workout: {},
		});
		expect(empty.success).toBe(false);
		if (!empty.success) {
			expect(empty.error.issues).toContainEqual(
				expect.objectContaining({
					message: "Include at least one workout metadata field",
				}),
			);
		}

		for (const workout of [
			{ exercises: [] },
			{ startTime: "2026-07-29T08:00:00Z" },
			{ unknown_field: "nope" },
		]) {
			expect(
				updateWorkoutInputSchema.safeParse({
					workout_id: "w1",
					workout,
				}).success,
			).toBe(false);
		}
	});

	it("accepts populated and empty exercise replacement arrays", () => {
		expect(
			replaceWorkoutExercisesInputSchema.parse({
				workout_id: "w1",
				workout: {
					exercises: [
						{
							exercise_template_id: "bench",
							sets: [{ type: "normal", reps: 8 }],
						},
					],
				},
			}).workout.exercises,
		).toHaveLength(1);
		expect(
			replaceWorkoutExercisesInputSchema.parse({
				workout_id: "w1",
				workout: { exercises: [] },
			}).workout.exercises,
		).toEqual([]);
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
