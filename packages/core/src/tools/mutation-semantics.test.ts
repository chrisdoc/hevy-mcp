import { describe, expect, it } from "vitest";
import {
	buildMeasurementPayload,
	buildRoutinePayload,
	buildWorkoutUpdatePayload,
	mergeMeasurementPayload,
} from "./mutation-semantics.js";
import type {
	RoutinePayloadInput,
	WorkoutExerciseInput,
} from "./input-schemas.js";

describe("mutation semantics", () => {
	it("normalizes routine rep ranges without changing API casing", () => {
		const input: RoutinePayloadInput = {
			title: "Routine",
			folder_id: null,
			notes: undefined,
			exercises: [
				{
					exercise_template_id: "squat",
					superset_id: null,
					rest_seconds: 60,
					notes: undefined,
					sets: [
						{
							type: "normal",
							weight_kg: 80,
							reps: null,
							distance_meters: undefined,
							duration_seconds: undefined,
							custom_metric: undefined,
							rep_range: { start: 8, end: 12 },
						},
					],
				},
			],
		};
		const created = buildRoutinePayload(input, "create");
		const updated = buildRoutinePayload(input, "update");

		expect(created.usesRepRanges).toBe(true);
		expect(updated.usesRepRanges).toBe(true);
		expect(created.payload.exercises?.[0]?.sets?.[0]).toMatchObject({
			weight_kg: 80,
			rep_range: { start: 8, end: 12 },
			reps: null,
		});
		expect(
			buildRoutinePayload(
				{
					...input,
					exercises: input.exercises.map((e) => ({
						...e,
						sets: [{ type: "normal" }],
					})),
				},
				"create",
			).payload.exercises?.[0]?.sets?.[0],
		).toHaveProperty("rep_range", null);
		expect(
			buildRoutinePayload(
				{
					...input,
					exercises: input.exercises.map((e) => ({
						...e,
						sets: [{ type: "normal" }],
					})),
				},
				"update",
			).payload.exercises?.[0]?.sets?.[0],
		).not.toHaveProperty("rep_range");
	});

	it("derives fixed reps and preserves routine metrics", () => {
		const input: RoutinePayloadInput = {
			title: "Simple routine",
			folder_id: 4,
			notes: "Notes",
			exercises: [
				{
					exercise_template_id: "row",
					superset_id: 1,
					rest_seconds: 30,
					notes: "Brace hard",
					sets: [
						{
							type: "normal",
							weight_kg: 80,
							reps: null,
							distance_meters: 4,
							duration_seconds: 6,
							custom_metric: 7,
							rep_range: { start: 8, end: 8 },
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
			weight_kg: 80,
			reps: 8,
			distance_meters: 4,
			duration_seconds: 6,
			custom_metric: 7,
		});
	});

	it("builds a validated metadata patch while preserving fetched workout data", () => {
		const current = {
			id: "w1",
			title: "Original",
			description: "Keep this",
			routine_id: "routine-1",
			start_time: "2026-07-29T08:00:00Z",
			end_time: "2026-07-29T09:00:00Z",
			created_at: "2026-07-29T08:00:00Z",
			updated_at: "2026-07-29T09:05:00Z",
			exercises: [
				{
					index: 7,
					title: "Bench Press",
					exercise_template_id: "bench",
					supersets_id: 12,
					notes: undefined,
					sets: [
						{
							index: 2,
							type: "normal",
							weight_kg: 50,
							reps: 8,
							distance_meters: null,
							duration_seconds: null,
							rpe: null,
							custom_metric: 1,
						},
						{
							index: 3,
							weight_kg: null,
							reps: null,
							distance_meters: null,
							duration_seconds: null,
							rpe: null,
							custom_metric: null,
						},
					],
				},
				{
					index: 8,
					title: "Row",
					exercise_template_id: "row",
					supersets_id: null,
					notes: "Brace hard",
					sets: [
						{
							index: 4,
							type: "failure",
							weight_kg: 40,
							reps: 10,
							distance_meters: null,
							duration_seconds: null,
							rpe: 9,
							custom_metric: null,
						},
					],
				},
			],
		};
		const snapshot = structuredClone(current);

		const payload = buildWorkoutUpdatePayload(current, {
			title: "Renamed",
			description: null,
			is_private: false,
		});

		expect(payload).toEqual({
			title: "Renamed",
			description: null,
			start_time: "2026-07-29T08:00:00Z",
			end_time: "2026-07-29T09:00:00Z",
			is_private: false,
			exercises: [
				{
					exercise_template_id: "bench",
					superset_id: 12,
					notes: null,
					sets: [
						{
							type: "normal",
							weight_kg: 50,
							reps: 8,
							distance_meters: null,
							duration_seconds: null,
							rpe: null,
							custom_metric: 1,
						},
						{
							weight_kg: null,
							reps: null,
							distance_meters: null,
							duration_seconds: null,
							rpe: null,
							custom_metric: null,
						},
					],
				},
				{
					exercise_template_id: "row",
					superset_id: null,
					notes: "Brace hard",
					sets: [
						{
							type: "failure",
							weight_kg: 40,
							reps: 10,
							distance_meters: null,
							duration_seconds: null,
							rpe: 9,
							custom_metric: null,
						},
					],
				},
			],
		});
		expect(current).toEqual(snapshot);
	});

	it("uses fetched metadata for omitted patch fields and omits privacy", () => {
		const current = {
			title: "Original",
			description: "Keep this",
			start_time: "2026-07-29T08:00:00Z",
			end_time: "2026-07-29T09:00:00Z",
			exercises: [],
		};

		const payload = buildWorkoutUpdatePayload(current, { title: "Renamed" });

		expect(payload).toMatchObject({
			title: "Renamed",
			description: "Keep this",
			start_time: current.start_time,
			end_time: current.end_time,
			exercises: [],
		});
		expect(payload).not.toHaveProperty("is_private");
	});

	it("replaces or removes exercises without requiring fetched exercises", () => {
		const current = {
			title: "Original",
			start_time: "2026-07-29T08:00:00Z",
			end_time: "2026-07-29T09:00:00Z",
		};
		const replacement: WorkoutExerciseInput[] = [
			{
				exercise_template_id: "new",
				sets: [{ type: "normal", reps: 5 }],
			},
		];

		expect(
			buildWorkoutUpdatePayload(current, { title: "Renamed" }, replacement)
				.exercises,
		).toEqual(replacement);
		expect(
			buildWorkoutUpdatePayload(current, { title: "Renamed" }, []).exercises,
		).toEqual([]);
	});

	it("preserves malformed fetched exercise data without revalidating it", () => {
		const valid = {
			title: "Original",
			start_time: "2026-07-29T08:00:00Z",
			end_time: "2026-07-29T09:00:00Z",
			exercises: [
				{
					exercise_template_id: "bench",
					sets: [{ type: "normal", reps: 8 }],
				},
			],
		};
		const malformed = [
			{ ...valid, exercises: undefined },
			{
				...valid,
				exercises: [{ sets: [{ type: "normal" }] }],
			},
			{
				...valid,
				exercises: [{ exercise_template_id: "bench", sets: undefined }],
			},
			{
				...valid,
				exercises: [
					{
						exercise_template_id: "bench",
						sets: [{ type: "invalid" }],
					},
				],
			},
			{
				...valid,
				exercises: [
					{
						exercise_template_id: "bench",
						sets: [{ type: "normal", rpe: 5 }],
					},
				],
			},
			{
				...valid,
				exercises: [
					{
						exercise_template_id: "bench",
						sets: [{ type: "normal", reps: 1.5 }],
					},
				],
			},
		];

		for (const current of malformed) {
			expect(() =>
				buildWorkoutUpdatePayload(current, { title: "New" }),
			).not.toThrow();
		}
		expect(
			buildWorkoutUpdatePayload(
				{
					...valid,
					exercises: [
						{
							exercise_template_id: "bench",
							sets: [{ type: "invalid", rpe: 5, reps: 1.5 }],
						},
					],
				},
				{ title: "New" },
			).exercises,
		).toMatchObject([{ sets: [{ type: "invalid", rpe: 5, reps: 1.5 }] }]);
		expect(
			buildWorkoutUpdatePayload({ ...valid, exercises: [] }, { title: "New" })
				.exercises,
		).toEqual([]);
		expect(() =>
			buildWorkoutUpdatePayload(
				{ ...valid, start_time: undefined },
				{ title: "New" },
			),
		).toThrow();
	});

	it("omits null and undefined measurement fields", () => {
		expect(
			buildMeasurementPayload({
				weight_kg: 80,
				lean_mass_kg: null,
				fat_percent: undefined,
			}),
		).toEqual({ weight_kg: 80 });
	});

	it("merges measurement changes while preserving API-rejected nulls", () => {
		expect(
			mergeMeasurementPayload(
				{
					date: "2024-01-02",
					weight_kg: 80,
					fat_percent: 20,
					neck_cm: 40,
				},
				{ weight_kg: 81, fat_percent: null },
			),
		).toEqual({
			payload: { weight_kg: 81, neck_cm: 40 },
			measurement: {
				date: "2024-01-02",
				weight_kg: 81,
				fat_percent: 20,
				neck_cm: 40,
			},
		});
	});
});
