import { describe, expect, it, vi } from "vitest";
import { createMockHevyClient } from "../../test-fixtures/mock-hevy.js";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";
import { createToolRuntime } from "./tool-runtime.js";
import {
	scanPagesInWindow,
	getTrainingSummary,
	workflowToolDefinitions,
} from "./workflows.js";

describe("get-training-summary", () => {
	it("scans all bounded pages for in-window compact evidence", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));
		try {
			const client = createMockHevyClient();
			client.getWorkouts
				.mockResolvedValueOnce({
					page: 1,
					page_count: 2,
					workouts: [
						{
							id: "old",
							start_time: "2026-05-01T08:00:00Z",
							end_time: "2026-05-01T09:00:00Z",
						},
					],
				})
				.mockResolvedValueOnce({
					page: 2,
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
				});
			client.getBodyMeasurements
				.mockResolvedValueOnce({
					page: 1,
					page_count: 2,
					body_measurements: [{ date: "2026-05-01", weight_kg: 81 }],
				})
				.mockResolvedValueOnce({
					page: 2,
					page_count: 2,
					body_measurements: [
						{ date: "2026-07-01", weight_kg: 80 },
						{ date: "2026-07-15", weight_kg: 79 },
					],
				});
			const runtime = createToolRuntime({
				client,
				catalog: {} as ExerciseTemplateCatalog,
			});
			const summary = await getTrainingSummary(runtime, 4);
			expect(summary.workouts).toMatchObject({
				count: 1,
				total_duration_seconds: 90000,
				exercise_count: 1,
				set_count: 2,
				unique_exercise_template_ids: ["bench"],
			});
			expect(summary.body_measurements).toMatchObject({
				count: 2,
				weight_change_kg: -1,
			});
			expect(summary.workflow).toEqual({
				name: "training-summary",
				pagination: { workouts: 2, body_measurements: 2 },
				cacheStatus: "not-used",
				itemsScanned: 5,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("scans older pages but stops at a valid page_count", async () => {
		type Item = { date?: string; id: string };
		const loader = vi
			.fn()
			.mockResolvedValueOnce({
				items: [{ id: "old", date: "2026-06-01" }],
				pageCount: 2,
			})
			.mockResolvedValueOnce({
				items: [{ id: "recent", date: "2026-07-15" }],
				pageCount: 2,
			});
		await expect(
			scanPagesInWindow<Item>(
				loader,
				10,
				"2026-07-01",
				"2026-07-16",
				(item) => item.date,
			),
		).resolves.toEqual({
			items: [{ id: "recent", date: "2026-07-15" }],
			pages: 2,
			itemsScanned: 2,
		});
		expect(loader).toHaveBeenNthCalledWith(1, 1, 10);
		expect(loader).toHaveBeenNthCalledWith(2, 2, 10);
		expect(loader).toHaveBeenCalledTimes(2);
	});

	it("keeps sparse collection results safe", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));
		try {
			const client = createMockHevyClient();
			client.getWorkouts.mockImplementation(() => undefined);
			client.getBodyMeasurements.mockImplementation(() => undefined);
			const runtime = createToolRuntime({
				client,
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
