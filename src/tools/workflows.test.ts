import { describe, expect, it, vi } from "vitest";
import type { HevyClient } from "../utils/hevyClient.js";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";
import { createToolRuntime } from "./tool-runtime.js";
import { getTrainingSummary } from "./workflows.js";

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
});
