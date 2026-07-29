import { describe, expect, it, vi } from "vitest";
import type { HevyClient } from "@hevy-mcp/hevy-client";
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
				unique_exercise_template_ids: ["bench"],
			});
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
