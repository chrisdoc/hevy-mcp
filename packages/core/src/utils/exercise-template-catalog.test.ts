import { describe, expect, it, vi } from "vitest";
import { createHevyClient, type HevyClient } from "@hevy-mcp/hevy-client";
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

	it("does not share a controlled refresh between independently cancellable callers", async () => {
		const firstController = new AbortController();
		const secondController = new AbortController();
		type ExerciseTemplatesResponse = Awaited<
			ReturnType<HevyClient["getExerciseTemplates"]>
		>;
		const responses: Array<Promise<ExerciseTemplatesResponse>> = [
			new Promise<ExerciseTemplatesResponse>((resolve, reject) => {
				firstController.signal.addEventListener(
					"abort",
					() => reject(firstController.signal.reason),
					{ once: true },
				);
				setTimeout(
					() =>
						resolve({
							page: 1,
							page_count: 1,
							exercise_templates: [{ id: "first", title: "First" }],
						}),
					100,
				);
			}),
			new Promise<ExerciseTemplatesResponse>((resolve) =>
				setTimeout(
					() =>
						resolve({
							page: 1,
							page_count: 1,
							exercise_templates: [{ id: "second", title: "Second" }],
						}),
					20,
				),
			),
		];
		const getExerciseTemplates = vi.fn<HevyClient["getExerciseTemplates"]>(
			(_params, _options) => {
				const response = responses.shift();
				if (!response) throw new Error("Unexpected extra page");
				return response;
			},
		);
		const client = {
			getExerciseTemplates,
		} satisfies Pick<HevyClient, "getExerciseTemplates">;
		const catalog = createExerciseTemplateCatalog(client);

		const first = catalog.get({
			execution: { signal: firstController.signal },
		});
		const second = catalog.get({
			execution: { signal: secondController.signal },
		});
		firstController.abort(new DOMException("first canceled", "AbortError"));

		await expect(first).rejects.toMatchObject({ name: "AbortError" });
		await expect(second).resolves.toMatchObject([{ id: "second" }]);
		expect(getExerciseTemplates).toHaveBeenCalledTimes(2);
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
