import { describe, expect, it, vi } from "vitest";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import type { Workout } from "@hevy-mcp/hevy-client/types";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";
import { createToolRuntime } from "./tool-runtime.js";
import {
	fetchRecentPages,
	getTrainingSummary,
	workflowToolDefinitions,
} from "./workflows.js";

describe("get-training-summary", () => {
	it("combines bounded pages into snake_case compact evidence", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));
		try {
			const getWorkouts = vi
				.fn()
				.mockResolvedValueOnce({
					page: 1,
					page_count: 2,
					workouts: [
						{
							id: "w1",
							title: "Push",
							start_time: "2026-07-15T08:00:00Z",
							end_time: "2026-07-16T09:00:00Z",
							exercises: [{ exercise_template_id: "bench", sets: [{}, {}] }],
						},
					],
				})
				.mockResolvedValueOnce({
					page: 2,
					page_count: 2,
					workouts: [
						{
							id: "old",
							start_time: "2026-06-01T08:00:00Z",
							end_time: "2026-06-01T09:00:00Z",
						},
					],
				});
			const getBodyMeasurements = vi.fn().mockResolvedValue({
				page: 1,
				page_count: 1,
				body_measurements: [
					{ date: "2026-07-01", weight_kg: 80 },
					{ date: "2026-07-15", weight_kg: 79 },
				],
			});
			const runtime = createToolRuntime({
				client: { getWorkouts, getBodyMeasurements } as unknown as HevyClient,
				catalog: {} as ExerciseTemplateCatalog,
			});
			const summary = await getTrainingSummary(runtime, 4);
			expect(summary.workouts).toMatchObject({
				count: 1,
				total_duration_seconds: 90000,
				exercise_count: 1,
				set_count: 2,
				working_set_count: 2,
				unique_exercise_template_ids: ["bench"],
			});
			expect(summary.workouts.weekly.at(-1)).toMatchObject({
				start_date: "2026-07-10",
				end_date: "2026-07-16",
				workout_count: 1,
				total_duration_seconds: 90000,
				exercise_count: 1,
				set_count: 2,
				working_set_count: 2,
			});
			expect(summary.workouts.exercise_trends).toMatchObject([
				{
					exercise_template_id: "bench",
					session_count: 1,
					set_count: 2,
					working_set_count: 2,
				},
			]);
			expect(summary.body_measurements).toMatchObject({
				count: 2,
				weight_change_kg: -1,
			});
			expect(summary.workflow).toEqual({
				name: "training-summary",
				pagination: { workouts: 2, body_measurements: 1 },
				cacheStatus: "not-used",
				itemsScanned: 4,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("aggregates modalities, excludes warmups, and bounds exercise trends", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));
		try {
			const benchWorkouts: Workout[] = Array.from({ length: 7 }, (_, index) => {
				const day = 10 + index;
				const date = `2026-07-${String(day).padStart(2, "0")}`;
				const sets =
					day === 16
						? [
								{
									type: "warmup",
									weight_kg: 100,
									reps: 100,
									rpe: 10,
								},
								{
									type: "normal",
									weight_kg: 60,
									reps: 5,
									rpe: 8,
									distance_meters: 100,
									duration_seconds: 30,
									custom_metric: 2,
								},
								{
									type: "failure",
									weight_kg: null,
									reps: 10,
									rpe: 9,
									distance_meters: 50,
									duration_seconds: 20,
									custom_metric: 3,
								},
							]
						: [{ type: "normal", weight_kg: 50, reps: 5 }];
				return {
					id: `bench-${day}`,
					title: `Bench ${day}`,
					start_time: `${date}T08:00:00Z`,
					end_time: `${date}T09:00:00Z`,
					exercises: [
						{
							title: "Bench Press",
							exercise_template_id: "bench",
							sets,
						},
					],
				};
			});
			const tiedExercises = Array.from({ length: 11 }, (_, index) => ({
				title: `Exercise ${index}`,
				exercise_template_id: `exercise-${String(index).padStart(2, "0")}`,
				sets: [{ reps: index + 1 }],
			}));
			const latestWorkout = benchWorkouts.at(-1);
			if (!latestWorkout) throw new Error("Expected a latest workout");
			latestWorkout.exercises = [
				...(latestWorkout.exercises ?? []),
				...tiedExercises,
			];

			const runtime = createToolRuntime({
				client: {
					getWorkouts: vi.fn().mockResolvedValue({
						workouts: [...benchWorkouts].reverse(),
					}),
					getBodyMeasurements: vi.fn().mockResolvedValue({
						body_measurements: [],
					}),
				} as unknown as HevyClient,
				catalog: {} as ExerciseTemplateCatalog,
			});

			const summary = await getTrainingSummary(runtime, 1);
			const bench = summary.workouts.exercise_trends[0];
			expect(summary.period).toEqual({
				start_date: "2026-07-10",
				end_date: "2026-07-16",
				weeks: 1,
			});
			expect(summary.workouts.working_set_count).toBe(19);
			expect(summary.workouts.exercise_trend_coverage).toEqual({
				eligible_exercise_count: 12,
				included_exercise_count: 10,
				exercise_limit: 10,
				sessions_per_exercise_limit: 6,
				truncated: true,
			});
			expect(
				summary.workouts.exercise_trends.map(
					({ exercise_template_id }) => exercise_template_id,
				),
			).toEqual([
				"bench",
				"exercise-00",
				"exercise-01",
				"exercise-02",
				"exercise-03",
				"exercise-04",
				"exercise-05",
				"exercise-06",
				"exercise-07",
				"exercise-08",
			]);
			expect(bench).toMatchObject({
				exercise_template_id: "bench",
				title: "Bench Press",
				session_count: 7,
				set_count: 9,
				working_set_count: 8,
			});
			expect(bench?.sessions).toHaveLength(6);
			expect(bench?.sessions[0]?.start_time).toBe("2026-07-11T08:00:00Z");
			expect(bench?.sessions.at(-1)).toEqual({
				workout_id: "bench-16",
				workout_title: "Bench 16",
				start_time: "2026-07-16T08:00:00Z",
				set_count: 3,
				working_set_count: 2,
				total_reps: 15,
				weighted_rep_volume_kg: 300,
				top_weight_kg: 60,
				top_reps: 10,
				top_rpe: 9,
				total_distance_meters: 150,
				total_duration_seconds: 50,
				total_custom_metric: 5,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("filters recent pages and stops after an older page", async () => {
		type Item = { date?: string; id: string };
		const loader = vi
			.fn()
			.mockResolvedValueOnce({
				items: [{ id: "recent", date: "2026-07-15" }, { id: "undated" }],
				pageCount: 3,
			})
			.mockResolvedValueOnce({
				items: [{ id: "old", date: "2026-06-01" }],
				pageCount: 3,
			});
		await expect(
			fetchRecentPages<Item>(
				loader,
				10,
				"2026-07-01",
				"2026-07-16",
				(item) => item.date,
			),
		).resolves.toEqual({
			items: [{ id: "recent", date: "2026-07-15" }],
			pages: 2,
			itemsScanned: 3,
		});
	});

	it("keeps sparse collection results safe", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));
		try {
			const runtime = createToolRuntime({
				client: {
					getWorkouts: vi.fn().mockResolvedValue(undefined),
					getBodyMeasurements: vi.fn().mockResolvedValue(undefined),
				} as unknown as HevyClient,
				catalog: {} as ExerciseTemplateCatalog,
			});
			await expect(
				workflowToolDefinitions[0].execute(runtime, { weeks: 1 }),
			).resolves.toMatchObject({
				workouts: {
					count: 0,
					total_duration_seconds: 0,
					exercise_count: 0,
					set_count: 0,
					unique_exercise_template_ids: [],
					sessions: [],
				},
				body_measurements: { count: 0 },
			});
		} finally {
			vi.useRealTimers();
		}
	});
});
