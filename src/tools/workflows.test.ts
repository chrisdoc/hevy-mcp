import { describe, expect, it, vi } from "vitest";
import type { HevyClient } from "../utils/hevyClient.js";
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
				count: 1,
				totalDurationSeconds: 90000,
				exerciseCount: 1,
				setCount: 2,
				uniqueExerciseTemplateIds: ["bench"],
			});
			expect(summary.bodyMeasurements).toMatchObject({
				count: 2,
				weightChangeKg: -1,
			});
			expect(summary.workflow).toEqual({
				name: "training-summary",
				pagination: { workouts: 2, bodyMeasurements: 1 },
				cacheStatus: "not-used",
				itemsScanned: 4,
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
					uniqueExerciseTemplateIds: [],
					sessions: [],
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
