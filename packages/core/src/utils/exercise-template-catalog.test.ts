import { describe, expect, it, vi } from "vitest";
import { createHevyClient } from "@hevy-mcp/hevy-client";
import { createExerciseTemplateCatalog } from "./exercise-template-catalog.js";

describe("exercise template catalog", () => {
	it("reset clears the lifecycle cache and forces a fresh catalog request", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						page: 1,
						page_count: 1,
						exercise_templates: [{ id: "first", title: "First" }],
					}),
					{ headers: { "content-type": "application/json" } },
				),
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						page: 1,
						page_count: 1,
						exercise_templates: [{ id: "second", title: "Second" }],
					}),
					{ headers: { "content-type": "application/json" } },
				),
			);
		const client = createHevyClient({ apiKey: "key", fetch: fetchMock });
		const catalog = createExerciseTemplateCatalog(client);

		await expect(catalog.get()).resolves.toMatchObject([{ id: "first" }]);
		await expect(catalog.get()).resolves.toMatchObject([{ id: "first" }]);
		catalog.reset();
		await expect(catalog.get()).resolves.toMatchObject([{ id: "second" }]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
	it("deduplicates concurrent cache misses", async () => {
		let resolveResponse!: (response: Response) => void;
		const pendingResponse = new Promise<Response>((resolve) => {
			resolveResponse = resolve;
		});
		const fetchMock = vi.fn().mockReturnValue(pendingResponse);
		const client = createHevyClient({ apiKey: "key", fetch: fetchMock });
		const catalog = createExerciseTemplateCatalog(client);

		const first = catalog.get();
		const second = catalog.get();
		expect(fetchMock).toHaveBeenCalledOnce();
		resolveResponse(
			new Response(
				JSON.stringify({
					page: 1,
					page_count: 1,
					exercise_templates: [{ id: "shared", title: "Shared" }],
				}),
				{ headers: { "content-type": "application/json" } },
			),
		);

		await expect(Promise.all([first, second])).resolves.toEqual([
			[{ id: "shared", title: "Shared" }],
			[{ id: "shared", title: "Shared" }],
		]);
	});

	it("returns an empty catalog when a page omits its template array", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ page: 1, page_count: 1 }), {
				headers: { "content-type": "application/json" },
			}),
		);
		const client = createHevyClient({ apiKey: "key", fetch: fetchMock });
		const catalog = createExerciseTemplateCatalog(client);

		await expect(catalog.get()).resolves.toEqual([]);
		expect(fetchMock).toHaveBeenCalledOnce();
	});
});
