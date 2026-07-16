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

	it("prefers explicit workout set values and preserves optional metadata", () => {
		const input: WorkoutPayloadInput = {
			title: "Conditioning",
			description: undefined,
			startTime: "2025-01-01T10:00:00Z",
			endTime: "2025-01-01T11:00:00Z",
			isPrivate: true,
			exercises: [
				{
					exerciseTemplateId: "row",
					supersetId: 2,
					notes: "Keep a steady pace",
					sets: [
						{
							type: "normal",
							weight: 20,
							weightKg: 80,
							reps: 10,
							distance: 3,
							distanceMeters: 4,
							duration: 5,
							durationSeconds: 6,
							rpe: null,
							customMetric: 7,
						},
					],
				},
			],
		};

		expect(buildWorkoutPayload(input)).toEqual({
			title: "Conditioning",
			description: null,
			start_time: "2025-01-01T10:00:00Z",
			end_time: "2025-01-01T11:00:00Z",
			is_private: true,
			exercises: [
				{
					exercise_template_id: "row",
					superset_id: 2,
					notes: "Keep a steady pace",
					sets: [
						{
							type: "normal",
							weight_kg: 20,
							reps: 10,
							distance_meters: 3,
							duration_seconds: 5,
							rpe: null,
							custom_metric: 7,
						},
					],
				},
			],
		});
	});

	it("uses null fallbacks when workout set fields are all omitted", () => {
		const input: WorkoutPayloadInput = {
			title: "Minimal",
			description: null,
			startTime: "2025-01-01T10:00:00Z",
			endTime: "2025-01-01T11:00:00Z",
			isPrivate: false,
			exercises: [
				{
					exerciseTemplateId: "plank",
					supersetId: null,
					notes: null,
					sets: [
						{
							type: "normal",
							weight: null,
							weightKg: null,
							reps: null,
							distance: null,
							distanceMeters: null,
							duration: null,
							durationSeconds: null,
							rpe: null,
							customMetric: null,
						},
					],
				},
			],
		};

		expect(buildWorkoutPayload(input).exercises?.[0]?.sets?.[0]).toEqual({
			type: "normal",
			weight_kg: null,
			reps: null,
			distance_meters: null,
			duration_seconds: null,
			rpe: null,
			custom_metric: null,
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

	it("maps fixed ranges and direct routine set values", () => {
		const input: RoutinePayloadInput = {
			title: "Simple routine",
			folderId: 4,
			notes: "Notes",
			exercises: [
				{
					exerciseTemplateId: "row",
					supersetId: 1,
					restSeconds: 30,
					notes: "Brace hard",
					sets: [
						{
							type: "normal",
							weight: 20,
							weightKg: 80,
							reps: null,
							distance: 3,
							distanceMeters: 4,
							duration: 5,
							durationSeconds: 6,
							customMetric: 7,
							repRange: { start: 8, end: 8 },
						},
						{
							type: "normal",
							repRange: { start: null, end: null },
						},
					],
				},
			],
		};

		const result = buildRoutinePayload(input, "create");
		expect(result.usesRepRanges).toBe(false);
		expect(result.payload).toMatchObject({
			title: "Simple routine",
			folder_id: 4,
			notes: "Notes",
			exercises: [
				{
					superset_id: 1,
					rest_seconds: 30,
					notes: "Brace hard",
				},
			],
		});
		expect(result.payload.exercises?.[0]?.sets?.[0]).toMatchObject({
			weight_kg: 20,
			reps: 8,
			distance_meters: 3,
			duration_seconds: 5,
			custom_metric: 7,
			rep_range: { start: 8, end: 8 },
		});

		const partialRangeInput: RoutinePayloadInput = {
			...input,
			exercises: input.exercises.map((exercise) => ({
				...exercise,
				sets: [
					...exercise.sets,
					{ type: "normal", repRange: { start: null, end: 8 } },
					{ type: "normal", repRange: { start: 8, end: null } },
				],
			})),
		};
		expect(buildRoutinePayload(partialRangeInput, "create").usesRepRanges).toBe(
			true,
		);

		const noRestInput: RoutinePayloadInput = {
			...input,
			exercises: input.exercises.map((exercise) => ({
				...exercise,
				restSeconds: undefined,
			})),
		};
		expect(
			buildRoutinePayload(noRestInput, "create").payload.exercises?.[0]
				?.rest_seconds,
		).toBeNull();
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
