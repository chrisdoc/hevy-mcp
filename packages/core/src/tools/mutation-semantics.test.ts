import { describe, expect, it } from "vitest";
import {
	buildMeasurementPayload,
	buildRoutinePayload,
	mergeMeasurementPayload,
} from "./mutation-semantics.js";
import type { RoutinePayloadInput } from "./input-schemas.js";

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

	it("omits null and undefined measurement fields", () => {
		expect(
			buildMeasurementPayload({
				weight_kg: 80,
				lean_mass_kg: null,
				fat_percent: undefined,
			}),
		).toEqual({ weight_kg: 80 });
	});

	it("merges measurement changes while omitting API-rejected nulls", () => {
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
				fat_percent: null,
				neck_cm: 40,
			},
		});
	});
});
