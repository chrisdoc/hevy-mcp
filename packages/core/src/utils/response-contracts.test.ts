import { z } from "zod";
import { describe, expect, it } from "vitest";
import type {
	ExerciseHistoryEntry,
	Routine,
	Workout,
} from "@hevy-mcp/hevy-client/types";

import {
	compactRoutinesResponse,
	createRoutineResponse,
	defineJsonResponseContract,
	defineStructuredResponseContract,
	exerciseHistoryResponse,
	exerciseTemplatesResponse,
	respond,
	routineFoldersResponse,
	trainingSummaryResponse,
	workoutResponse,
	workoutsResponse,
	type CompactRoutinesResult,
	type TrainingSummaryResult,
} from "./response-contracts.js";
import { getResultTelemetry } from "./result-telemetry.js";

describe("response contracts", () => {
	it("validates normalized structured output and strips unknown fields", () => {
		const contract = defineStructuredResponseContract({
			outputSchema: { item: z.object({ id: z.string(), count: z.number() }) },
			normalize: () => ({
				item: { id: "item-1", count: 3, ignored: true },
				ignoredWrapper: true,
			}),
			legacyJson: ({ item }) => item,
		});
		expect(respond(contract, undefined).structuredContent).toEqual({
			item: { id: "item-1", count: 3 },
		});
	});

	it("keeps wrappers structured while legacy JSON stays unwrapped", () => {
		const workout: Workout = {
			id: "w1",
			title: "Workout",
			start_time: "2025-01-01T10:00:00Z",
			end_time: "2025-01-01T11:00:00Z",
			exercises: [],
		};
		const response = respond(workoutsResponse, [workout]);
		expect(response.structuredContent).toMatchObject({
			workouts: [{ id: "w1", duration: "1h 0m 0s" }],
		});
		const structuredContent = response.structuredContent as {
			workouts: unknown;
		};
		expect(JSON.parse(response.content[0].text)).toEqual(
			structuredContent.workouts,
		);
	});

	it("uses snake_case null and pagination output keys", () => {
		expect(
			respond(workoutResponse, { workout: null, workout_id: "missing" }),
		).toMatchObject({
			content: [{ text: "Workout with ID missing not found" }],
			structuredContent: { workout: null },
		});
		expect(
			respond(workoutsResponse, { items: [], page: 2 }).structuredContent,
		).toMatchObject({ workouts: [], page: 2 });
		expect(
			respond(exerciseTemplatesResponse, undefined).structuredContent,
		).toMatchObject({ exercise_templates: [], page: 1 });
		expect(
			respond(routineFoldersResponse, undefined).structuredContent,
		).toMatchObject({ routine_folders: [], page: 1 });
		expect(
			respond(exerciseHistoryResponse, {
				exercise_history: undefined,
				exercise_template_id: "template-1",
			}),
		).toMatchObject({
			content: [{ text: "No exercise history found for template template-1" }],
			structuredContent: { exercise_history: [] },
		});
	});

	it("normalizes nullable exercise history metrics into sparse output", () => {
		const historyEntry: ExerciseHistoryEntry = {
			workout_id: "workout-1",
			workout_title: "Morning workout",
			exercise_template_id: "bench",
			weight_kg: null,
			reps: 8,
			distance_meters: null,
			duration_seconds: null,
			rpe: null,
			custom_metric: null,
			set_type: "normal",
		};
		const response = respond(exerciseHistoryResponse, {
			exercise_history: [historyEntry],
			exercise_template_id: "bench",
		});
		const expected = [
			{
				workout_id: "workout-1",
				workout_title: "Morning workout",
				exercise_template_id: "bench",
				reps: 8,
				set_type: "normal",
			},
		];

		expect(response.structuredContent).toEqual({
			exercise_history: expected,
		});
		expect(JSON.parse(response.content[0].text)).toEqual(expected);
		expect(response.content[0].text).not.toContain("weight_kg");
		expect(response.content[0].text).not.toContain("distance_meters");
		expect(response.content[0].text).not.toContain("duration_seconds");
		expect(response.content[0].text).not.toContain("custom_metric");
		expect(response.content[0].text).not.toContain("rpe");
	});

	it("supports JSON-only and text-only contracts", () => {
		expect(
			respond(
				defineJsonResponseContract((value: unknown) => ({ json: value })),
				undefined,
			),
		).toEqual({ content: [{ type: "text", text: "null" }] });
		expect(
			respond(
				defineJsonResponseContract((value: string) => ({ text: value })),
				"done",
			),
		).toEqual({ content: [{ type: "text", text: "done" }] });
	});

	it("preserves routine rep-range warnings and telemetry", () => {
		const routine: Routine = { id: "r1", title: "Routine", exercises: [] };
		const response = respond(createRoutineResponse, {
			routine,
			usesRepRanges: true,
		});
		expect(response.content).toHaveLength(2);
		expect(response.content[1].text).toContain("rep ranges");
		expect(
			getResultTelemetry(
				respond(createRoutineResponse, { routine, usesRepRanges: false }),
			),
		).toMatchObject({ itemCountBucket: "1" });
	});

	it("renders workflow scan evidence from internal workflow metadata", () => {
		const empty: TrainingSummaryResult = {
			period: { start_date: "2026-07-01", end_date: "2026-07-16", weeks: 2 },
			workouts: {
				count: 0,
				total_duration_seconds: 0,
				exercise_count: 0,
				set_count: 0,
				unique_exercise_template_ids: [],
				sessions: [],
			},
			body_measurements: { count: 0 },
			workflow: {
				name: "training-summary",
				pagination: { workouts: 0, body_measurements: 0 },
				cacheStatus: "not-used",
				itemsScanned: 0,
			},
		};
		const response = respond(trainingSummaryResponse, empty);
		expect(response.structuredContent).toMatchObject({
			period: empty.period,
			scan: { pages: empty.workflow.pagination, items: 0 },
		});

		const compact: CompactRoutinesResult = {
			routines: [{ id: "r1", title: "Push", exercise_count: 1, set_count: 2 }],
			workflow: {
				name: "routine-discovery",
				pagination: { routines: 1 },
				cacheStatus: "not-used",
				itemsScanned: 1,
			},
		};
		expect(
			JSON.parse(respond(compactRoutinesResponse, compact).content[0].text),
		).toEqual(compact.routines);
	});
});
