import { describe, expect, it, vi } from "vitest";
import type { HevyClient } from "../utils/hevyClient.js";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";
import { createToolRuntime } from "./tool-runtime.js";
import { discoverRoutines } from "./routine-discovery.js";

describe("search-routines", () => {
	it("filters routine titles and returns compact metadata", async () => {
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
					folderId: 3,
					updatedAt: "2026-07-15T08:00:00Z",
					exerciseCount: 1,
					setCount: 2,
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
});
