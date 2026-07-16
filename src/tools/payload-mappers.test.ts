import { describe, expect, it } from "vitest";
import {
	buildMeasurementPayload,
	buildRoutinePayload,
	buildWorkoutPayload,
} from "./payload-mappers.js";
import type {
	RoutinePayloadInput,
	WorkoutPayloadInput,
} from "./input-schemas.js";

describe("payload mappers", () => {
	it("maps identical workout exercises for create and update inputs", () => {
		const input: WorkoutPayloadInput = {
			title: "Strength",
			description: null,
			startTime: "2025-01-01T10:00:00Z",
			endTime: "2025-01-01T11:00:00Z",
			isPrivate: false,
			exercises: [
				{
					exerciseTemplateId: "bench",
					supersetId: null,
					notes: null,
					sets: [
						{
							type: "normal",
							weight: null,
							weightKg: 50,
							reps: 8,
							distance: null,
							distanceMeters: 2,
							duration: null,
							durationSeconds: 30,
							rpe: 8,
							customMetric: null,
						},
					],
				},
			],
		};
		const updateInput = { ...input, workoutId: "workout-1" };

		expect(buildWorkoutPayload(input)).toEqual(
			buildWorkoutPayload(updateInput),
		);
		expect(buildWorkoutPayload(input)).toMatchObject({
			exercises: [
				{
					sets: [
						{
							weight_kg: 50,
							distance_meters: 2,
							duration_seconds: 30,
						},
					],
				},
			],
		});
	});

	it("marks non-fixed ranges and preserves create/update null omission", () => {
		const input: RoutinePayloadInput = {
			title: "Routine",
			folderId: null,
			notes: undefined,
			exercises: [
				{
					exerciseTemplateId: "squat",
					supersetId: null,
					restSeconds: 60,
					notes: undefined,
					sets: [
						{
							type: "normal",
							weight: undefined,
							weightKg: 80,
							reps: null,
							distance: undefined,
							distanceMeters: undefined,
							duration: undefined,
							durationSeconds: undefined,
							customMetric: undefined,
							repRange: { start: 8, end: 12 },
						},
					],
				},
			],
		};
		const created = buildRoutinePayload(input, "create");
		const updated = buildRoutinePayload(input, "update");

		expect(created.usesRepRanges).toBe(true);
		expect(updated.usesRepRanges).toBe(true);
		expect(created.payload.exercises?.[0]?.sets?.[0]?.rep_range).toEqual({
			start: 8,
			end: 12,
		});
		const noRange = {
			...input,
			exercises: input.exercises.map((exercise) => ({
				...exercise,
				sets: exercise.sets.map((set) => ({ ...set, repRange: undefined })),
			})),
		};
		expect(
			buildRoutinePayload(noRange, "create").payload.exercises?.[0]?.sets?.[0],
		).toHaveProperty("rep_range", null);
		expect(
			buildRoutinePayload(noRange, "update").payload.exercises?.[0]?.sets?.[0],
		).not.toHaveProperty("rep_range");
	});

	it("omits null and undefined measurement fields", () => {
		expect(
			buildMeasurementPayload({
				weightKg: 80,
				leanMassKg: null,
				fatPercent: undefined,
			}),
		).toEqual({ weight_kg: 80 });
	});
});
