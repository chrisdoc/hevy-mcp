import { describe, expect, it, vi } from "vitest";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";
import { createToolRuntime } from "./tool-runtime.js";
import {
	discoverRoutines,
	routineDiscoveryToolDefinitions,
} from "./routine-discovery.js";

describe("search-routines", () => {
	it("filters routine titles and returns snake_case compact metadata", async () => {
		const getRoutines = vi.fn().mockResolvedValue({
			page: 1,
			page_count: 1,
			routines: [
				{
					id: "routine-1",
					title: "Push Day",
					folder_id: 3,
					updated_at: "2026-07-15T08:00:00Z",
					exercises: [{ sets: [{}, {}] }],
				},
				{ id: "routine-2", title: "Leg Day", exercises: [{ sets: [{}] }] },
			],
		});
		const runtime = createToolRuntime({
			client: { getRoutines } as unknown as HevyClient,
			catalog: {} as ExerciseTemplateCatalog,
		});

		await expect(
			discoverRoutines(runtime, { query: "push", limit: 20 }),
		).resolves.toEqual({
			routines: [
				{
					id: "routine-1",
					title: "Push Day",
					folder_id: 3,
					updated_at: "2026-07-15T08:00:00Z",
					exercise_count: 1,
					set_count: 2,
				},
			],
			workflow: {
				name: "routine-discovery",
				pagination: { routines: 1 },
				cacheStatus: "not-used",
				itemsScanned: 2,
			},
		});
		expect(getRoutines).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
	});

	it("paginates and respects the snake_case limit result", async () => {
		const getRoutines = vi
			.fn()
			.mockResolvedValueOnce({
				page: 1,
				page_count: 2,
				routines: [{ title: "Push Day", exercises: [{ sets: [{}] }] }],
			})
			.mockResolvedValueOnce({
				page: 2,
				routines: [
					{},
					{
						id: "routine-2",
						title: "Pull Day",
						folder_id: null,
						updated_at: "2026-07-16T08:00:00Z",
						exercises: [{}, { sets: [{}, {}] }],
					},
				],
			});
		const runtime = createToolRuntime({
			client: { getRoutines } as unknown as HevyClient,
			catalog: {} as ExerciseTemplateCatalog,
		});
		const result = await discoverRoutines(runtime, {
			query: undefined,
			limit: 3,
		});
		expect(result.routines).toEqual([
			{ title: "Push Day", exercise_count: 1, set_count: 1 },
			{ exercise_count: 0, set_count: 0 },
			{
				id: "routine-2",
				title: "Pull Day",
				updated_at: "2026-07-16T08:00:00Z",
				exercise_count: 2,
				set_count: 2,
			},
		]);
		expect(getRoutines).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 10 });
		expect(getRoutines).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 10 });
	});

	it("executes through the composed search definition", async () => {
		const runtime = createToolRuntime({
			client: {
				getRoutines: vi.fn().mockResolvedValue(undefined),
			} as unknown as HevyClient,
			catalog: {} as ExerciseTemplateCatalog,
		});
		await expect(
			routineDiscoveryToolDefinitions[0].execute(runtime, {
				query: "push",
				limit: 1,
			}),
		).resolves.toMatchObject({ routines: [] });
	});
});
