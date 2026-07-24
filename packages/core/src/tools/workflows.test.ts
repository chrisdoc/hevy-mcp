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
	it("combines bounded workout and measurement pages into compact evidence", async () => {
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
							id: "workout-1",
							title: "Push",
							start_time: "2026-07-15T08:00:00Z",
							end_time: "2026-07-16T09:00:00Z",
							exercises: [
								{
									exercise_template_id: "bench",
									sets: [{}, {}],
								},
							],
						},
						{
							id: "today",
							start_time: "2026-07-16T23:59:59Z",
							end_time: "2026-07-16T23:59:59Z",
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
					{ date: "2026-07-01", weight_kg: 80, fat_percent: 20 },
					{ date: "2026-07-15", weight_kg: 79, fat_percent: 19 },
				],
			});
			const client = {
				getWorkouts,
				getBodyMeasurements,
			} as unknown as HevyClient;
			const runtime = createToolRuntime({
				client,
				catalog: {} as ExerciseTemplateCatalog,
			});

			const summary = await getTrainingSummary(runtime, 4);

			expect(getWorkouts).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 10 });
			expect(getWorkouts).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 10 });
			expect(getBodyMeasurements).toHaveBeenCalledWith({
				page: 1,
				pageSize: 10,
			});
			expect(summary.workouts).toMatchObject({
				count: 2,
				totalDurationSeconds: 90000,
				exerciseCount: 1,
				setCount: 2,
				workingSetCount: 2,
				uniqueExerciseTemplateIds: ["bench"],
				exerciseTrendCoverage: {
					eligibleExerciseCount: 1,
					includedExerciseCount: 1,
					exerciseLimit: 10,
					sessionsPerExerciseLimit: 6,
					truncated: false,
				},
			});
			expect(summary.period).toEqual({
				startDate: "2026-06-19",
				endDate: "2026-07-16",
				weeks: 4,
			});
			expect(summary.workouts.weekly).toEqual([
				expect.objectContaining({
					startDate: "2026-06-19",
					endDate: "2026-06-25",
					workoutCount: 0,
				}),
				expect.objectContaining({
					startDate: "2026-06-26",
					endDate: "2026-07-02",
					workoutCount: 0,
				}),
				expect.objectContaining({
					startDate: "2026-07-03",
					endDate: "2026-07-09",
					workoutCount: 0,
				}),
				{
					startDate: "2026-07-10",
					endDate: "2026-07-16",
					workoutCount: 2,
					totalDurationSeconds: 90000,
					exerciseCount: 1,
					setCount: 2,
					workingSetCount: 2,
				},
			]);
			expect(summary.bodyMeasurements).toMatchObject({
				count: 2,
				weightChangeKg: -1,
			});
			expect(summary.workflow).toEqual({
				name: "training-summary",
				pagination: { workouts: 2, bodyMeasurements: 1 },
				cacheStatus: "not-used",
				itemsScanned: 5,
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
		expect(loader).toHaveBeenNthCalledWith(1, 1, 10);
		expect(loader).toHaveBeenNthCalledWith(2, 2, 10);
	});

	it("aggregates modality metrics, ranks exercise trends, and caps session detail", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));
		try {
			const benchWorkouts: Workout[] = Array.from({ length: 7 }, (_, index) => {
				const day = 10 + index;
				return {
					id: `bench-${day}`,
					title: `Bench ${day}`,
					start_time: `2026-07-${String(day).padStart(2, "0")}T08:00:00Z`,
					end_time: `2026-07-${String(day).padStart(2, "0")}T09:00:00Z`,
					exercises: [
						{
							title: "Bench Press",
							exercise_template_id: "bench",
							sets:
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
									: [{ type: "normal", weight_kg: 50, reps: 5 }],
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
			const bench = summary.workouts.exerciseTrends[0];

			expect(summary.period).toEqual({
				startDate: "2026-07-10",
				endDate: "2026-07-16",
				weeks: 1,
			});
			expect(summary.workouts.workingSetCount).toBe(19);
			expect(summary.workouts.exerciseTrendCoverage).toEqual({
				eligibleExerciseCount: 12,
				includedExerciseCount: 10,
				exerciseLimit: 10,
				sessionsPerExerciseLimit: 6,
				truncated: true,
			});
			expect(
				summary.workouts.exerciseTrends.map(
					({ exerciseTemplateId }) => exerciseTemplateId,
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
				exerciseTemplateId: "bench",
				title: "Bench Press",
				sessionCount: 7,
				setCount: 9,
				workingSetCount: 8,
			});
			expect(bench?.sessions).toHaveLength(6);
			expect(bench?.sessions[0]?.startTime).toBe("2026-07-11T08:00:00Z");
			expect(bench?.sessions.at(-1)).toEqual({
				workoutId: "bench-16",
				workoutTitle: "Bench 16",
				startTime: "2026-07-16T08:00:00Z",
				setCount: 3,
				workingSetCount: 2,
				totalReps: 15,
				weightedRepVolumeKg: 300,
				topWeightKg: 60,
				topReps: 10,
				topRpe: 9,
				totalDistanceMeters: 150,
				totalDurationSeconds: 50,
				totalCustomMetric: 5,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("handles incomplete compact data and the composed tool executor", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));
		try {
			const getWorkouts = vi.fn().mockResolvedValue({
				workouts: [
					{
						start_time: "2026-07-15T08:00:00Z",
						exercises: [{ exercise_template_id: "", sets: [{}] }, {}],
					},
					{
						id: "invalid-duration",
						start_time: "2026-07-14T08:00:00Z",
						end_time: "also-not-a-date",
					},
				],
			});
			const getBodyMeasurements = vi.fn().mockResolvedValue({
				body_measurements: [
					{
						date: "2026-07-10",
						weight_kg: null,
						lean_mass_kg: 50,
						fat_percent: null,
					},
				],
			});
			const runtime = createToolRuntime({
				client: { getWorkouts, getBodyMeasurements } as unknown as HevyClient,
				catalog: {} as ExerciseTemplateCatalog,
			});

			const summary = await workflowToolDefinitions[0].execute(runtime, {
				weeks: 1,
			});

			expect(summary.workouts.sessions).toEqual([
				{
					startTime: "2026-07-15T08:00:00Z",
					durationSeconds: null,
					exerciseCount: 2,
					setCount: 1,
				},
				{
					id: "invalid-duration",
					startTime: "2026-07-14T08:00:00Z",
					endTime: "also-not-a-date",
					durationSeconds: null,
					exerciseCount: 0,
					setCount: 0,
				},
			]);
			expect(summary.workouts.uniqueExerciseTemplateIds).toEqual([]);
			expect(summary.workouts).toMatchObject({
				workingSetCount: 1,
				exerciseTrends: [],
				exerciseTrendCoverage: {
					eligibleExerciseCount: 0,
					includedExerciseCount: 0,
					truncated: false,
				},
			});
			expect(summary.bodyMeasurements).toEqual({
				count: 1,
				latest: {
					date: "2026-07-10",
					weightKg: null,
					leanMassKg: 50,
					fatPercent: null,
				},
				earliest: {
					date: "2026-07-10",
					weightKg: null,
					leanMassKg: 50,
					fatPercent: null,
				},
				weightChangeKg: null,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("returns empty workflow data when collection fields are absent", async () => {
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

			await expect(getTrainingSummary(runtime, 1)).resolves.toMatchObject({
				workouts: {
					count: 0,
					totalDurationSeconds: 0,
					exerciseCount: 0,
					setCount: 0,
					workingSetCount: 0,
					uniqueExerciseTemplateIds: [],
					sessions: [],
					weekly: [
						{
							startDate: "2026-07-10",
							endDate: "2026-07-16",
							workoutCount: 0,
							totalDurationSeconds: 0,
							exerciseCount: 0,
							setCount: 0,
							workingSetCount: 0,
						},
					],
					exerciseTrends: [],
					exerciseTrendCoverage: {
						eligibleExerciseCount: 0,
						includedExerciseCount: 0,
						exerciseLimit: 10,
						sessionsPerExerciseLimit: 6,
						truncated: false,
					},
				},
				bodyMeasurements: {
					count: 0,
					latest: null,
					earliest: null,
					weightChangeKg: null,
				},
			});
		} finally {
			vi.useRealTimers();
		}
	});
});
