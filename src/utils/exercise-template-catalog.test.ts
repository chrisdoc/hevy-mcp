import { describe, expect, it, vi } from "vitest";
import { createExerciseTemplateCatalog } from "./exercise-template-catalog.js";
import { createClient } from "./hevyClientKubb.js";

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
		const client = createClient("key", undefined, { fetch: fetchMock });
		const catalog = createExerciseTemplateCatalog();

		await expect(catalog.get(client)).resolves.toMatchObject([{ id: "first" }]);
		await expect(catalog.get(client)).resolves.toMatchObject([{ id: "first" }]);
		catalog.reset();
		await expect(catalog.get(client)).resolves.toMatchObject([
			{ id: "second" },
		]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
