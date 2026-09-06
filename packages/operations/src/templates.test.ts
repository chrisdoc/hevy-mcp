import { HevyHttpError, NotFoundError } from "@hevy-mcp/hevy-client";
import type {
	CreateCustomExerciseRequestBody,
	ExerciseHistoryEntry,
	ExerciseTemplate,
	GetV1ExerciseHistoryExercisetemplateid200,
	GetV1ExerciseTemplates200,
	PostV1ExerciseTemplates200,
} from "@hevy-mcp/hevy-client/types";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import {
	createTemplatesCreateOperation,
	createTemplatesGetOperation,
	createTemplatesHistoryOperation,
	createTemplatesListAllOperation,
	createTemplatesSearchOperation,
	type TemplatesGetAdapter,
	type TemplatesListAllAdapter,
} from "./templates.js";

function notFound(endpoint: string): NotFoundError {
	return new NotFoundError({
		status: 404,
		method: "GET",
		endpoint,
		expected: true,
	});
}

function createGetAdapter(
	response: ExerciseTemplate | Error,
): TemplatesGetAdapter {
	const getExerciseTemplate: TemplatesGetAdapter["getExerciseTemplate"] = (
		_id,
		_options,
	) =>
		response instanceof Error
			? Effect.fail(response)
			: Effect.succeed(response);
	return { getExerciseTemplate };
}

describe("templates.get operation", () => {
	it("returns the template entity and id with a read descriptor", async () => {
		const getExerciseTemplate = vi.fn(() =>
			Effect.succeed<ExerciseTemplate>({ id: "template-1", title: "Bench" }),
		);
		const operation = createTemplatesGetOperation({ getExerciseTemplate });
		const options = { timeoutMs: 1_000 };

		await expect(
			Effect.runPromise(
				operation.effect({ exerciseTemplateId: "template-1" }, options),
			),
		).resolves.toEqual({
			exerciseTemplate: { id: "template-1", title: "Bench" },
			exerciseTemplateId: "template-1",
		});
		expect(operation.descriptor).toEqual({
			id: "templates.get",
			safety: "read",
		});
		expect(getExerciseTemplate).toHaveBeenCalledWith("template-1", options);
	});

	it("recovers only a member 404 as not_found", async () => {
		const operation = createTemplatesGetOperation(
			createGetAdapter(notFound("/v1/exercise_templates/template-1")),
		);

		await expect(
			Effect.runPromise(operation.effect({ exerciseTemplateId: "template-1" })),
		).resolves.toEqual({
			exerciseTemplate: null,
			exerciseTemplateId: "template-1",
			expected404Outcome: "not_found",
		});
	});

	it("fails collection and unrelated 404s", async () => {
		for (const endpoint of [
			"/v1/exercise_templates",
			"/v1/routine_folders/folder-1",
		]) {
			const error = notFound(endpoint);
			const operation = createTemplatesGetOperation(createGetAdapter(error));

			await expect(
				Effect.runPromise(
					operation.effect({ exerciseTemplateId: "template-1" }),
				),
			).rejects.toBe(error);
		}
	});
});

describe("templates.history operation", () => {
	it("forwards only supplied date bounds and execution options", async () => {
		const history: ExerciseHistoryEntry[] = [{ workout_id: "workout-1" }];
		const getExerciseHistory = vi.fn(
			(
				_id: string,
				_params?: {
					start_date?: string;
					end_date?: string;
				},
				_options?: { timeoutMs?: number },
			) =>
				Effect.succeed<GetV1ExerciseHistoryExercisetemplateid200>({
					exercise_history: history,
				}),
		);
		const operation = createTemplatesHistoryOperation({ getExerciseHistory });
		const options = { timeoutMs: 1_000 };

		await expect(
			Effect.runPromise(
				operation.effect(
					{
						exerciseTemplateId: "template-1",
						startDate: "2026-01-01T00:00:00.000Z",
					},
					options,
				),
			),
		).resolves.toEqual({
			exerciseHistory: history,
			exerciseTemplateId: "template-1",
		});
		expect(getExerciseHistory).toHaveBeenCalledWith(
			"template-1",
			{ start_date: "2026-01-01T00:00:00.000Z" },
			options,
		);
	});

	it("uses an empty query object when no date bounds are supplied", async () => {
		const getExerciseHistory = vi.fn(() =>
			Effect.succeed<GetV1ExerciseHistoryExercisetemplateid200>({
				exercise_history: [],
			}),
		);
		const operation = createTemplatesHistoryOperation({ getExerciseHistory });

		await expect(
			Effect.runPromise(operation.effect({ exerciseTemplateId: "template-1" })),
		).resolves.toEqual({
			exerciseHistory: [],
			exerciseTemplateId: "template-1",
		});
		expect(getExerciseHistory).toHaveBeenCalledWith("template-1", {});
	});

	it("does not turn a history 404 into a successful absence", async () => {
		const error = notFound("/v1/exercise_history/template-1");
		const getExerciseHistory = vi.fn(() => Effect.fail(error));
		const operation = createTemplatesHistoryOperation({ getExerciseHistory });

		await expect(
			Effect.runPromise(operation.effect({ exerciseTemplateId: "template-1" })),
		).rejects.toBe(error);
	});
});

describe("templates.create operation", () => {
	it("posts the caller create body through the Effect adapter", async () => {
		const body: CreateCustomExerciseRequestBody = {
			exercise: { title: "Bench", other_muscles: [] },
		};
		const created: PostV1ExerciseTemplates200 = { id: 123 };
		const createExerciseTemplate = vi.fn(() => Effect.succeed(created));
		const operation = createTemplatesCreateOperation({
			createExerciseTemplate,
		});

		await expect(Effect.runPromise(operation.effect(body))).resolves.toEqual(
			created,
		);
		expect(createExerciseTemplate).toHaveBeenCalledWith(body);
	});
});

describe("templates.listAll operation", () => {
	it("concatenates pages at the API page size and stops at page_count", async () => {
		const requests: Array<{
			readonly params: Parameters<
				TemplatesListAllAdapter["getExerciseTemplates"]
			>[0];
			readonly options: Parameters<
				TemplatesListAllAdapter["getExerciseTemplates"]
			>[1];
		}> = [];
		const responses: GetV1ExerciseTemplates200[] = [
			{
				page: 1,
				page_count: 3,
				exercise_templates: [{ id: "template-1" }],
			},
			{
				page: 2,
				page_count: 3,
				exercise_templates: [{ id: "template-2" }],
			},
			{
				page: 3,
				page_count: 3,
				exercise_templates: [{ id: "template-3" }],
			},
		];
		const options = { timeoutMs: 1_000 };
		const getExerciseTemplates = vi.fn((params, requestOptions) => {
			requests.push({ params, options: requestOptions });
			return Effect.succeed(responses[(params?.page ?? 1) - 1] ?? {});
		});
		const operation = createTemplatesListAllOperation({
			getExerciseTemplates,
		});

		const templates = await Effect.runPromise(operation.effect(options));
		expect(templates).toEqual([
			{ id: "template-1" },
			{ id: "template-2" },
			{ id: "template-3" },
		]);
		expect(templates.pageCount).toBe(3);
		expect(requests).toEqual([
			{ params: { page: 1, pageSize: 100 }, options },
			{ params: { page: 2, pageSize: 100 }, options },
			{ params: { page: 3, pageSize: 100 }, options },
		]);
	});

	it("stops on an empty page without requesting another page", async () => {
		const getExerciseTemplates = vi
			.fn<TemplatesListAllAdapter["getExerciseTemplates"]>()
			.mockImplementation((params) =>
				Effect.succeed(
					params?.page === 1
						? {
								page: 1,
								page_count: 4,
								exercise_templates: [{ id: "template-1" }],
							}
						: { page: params?.page, page_count: 4, exercise_templates: [] },
				),
			);
		const operation = createTemplatesListAllOperation({
			getExerciseTemplates,
		});

		await expect(Effect.runPromise(operation.effect())).resolves.toEqual([
			{ id: "template-1" },
		]);
		expect(getExerciseTemplates).toHaveBeenCalledTimes(2);
	});

	it("ends on a later-page 404 but fails on a first-page 404", async () => {
		const laterPageError = notFound("/v1/exercise_templates");
		const laterPageAdapter = {
			getExerciseTemplates: vi
				.fn<TemplatesListAllAdapter["getExerciseTemplates"]>()
				.mockImplementation((params) =>
					params?.page === 1
						? Effect.succeed({
								page: 1,
								page_count: 3,
								exercise_templates: [{ id: "template-1" }],
							})
						: Effect.fail(laterPageError),
				),
		};
		const laterPageOperation =
			createTemplatesListAllOperation(laterPageAdapter);

		await expect(
			Effect.runPromise(laterPageOperation.effect()),
		).resolves.toEqual([{ id: "template-1" }]);
		expect(laterPageAdapter.getExerciseTemplates).toHaveBeenCalledTimes(2);

		const firstPageError = notFound("/v1/exercise_templates");
		const firstPageOperation = createTemplatesListAllOperation({
			getExerciseTemplates: vi
				.fn<TemplatesListAllAdapter["getExerciseTemplates"]>()
				.mockReturnValue(Effect.fail(firstPageError)),
		});

		await expect(Effect.runPromise(firstPageOperation.effect())).rejects.toBe(
			firstPageError,
		);
	});

	it.each([{ page_count: undefined }, { page_count: 1.5 }] as const)(
		"rejects malformed pagination metadata like search: %#",
		async (response) => {
			const getExerciseTemplates = vi.fn(() =>
				Effect.succeed({
					page: 1,
					page_count: response.page_count,
					exercise_templates: [],
				}),
			);
			const operation = createTemplatesListAllOperation({
				getExerciseTemplates,
			});

			await expect(Effect.runPromise(operation.effect())).rejects.toMatchObject(
				{
					_tag: "PaginationMismatchError",
					message: "The API returned invalid pagination metadata",
				},
			);
		},
	);

	it("rejects a page count smaller than the requested page", async () => {
		const getExerciseTemplates = vi.fn((params) =>
			Effect.succeed({
				page: params?.page,
				page_count: params?.page === 1 ? 2 : 1,
				exercise_templates: [{ id: `template-${params?.page}` }],
			}),
		);
		const operation = createTemplatesListAllOperation({
			getExerciseTemplates,
		});

		await expect(Effect.runPromise(operation.effect())).rejects.toMatchObject({
			_tag: "PaginationMismatchError",
			message: "The API returned invalid pagination metadata",
		});
	});

	it("rejects zero page count when a page contains templates", async () => {
		const operation = createTemplatesListAllOperation({
			getExerciseTemplates: () =>
				Effect.succeed({
					page: 1,
					page_count: 0,
					exercise_templates: [{ id: "template-1", title: "Bench" }],
				}),
		});

		await expect(Effect.runPromise(operation.effect())).rejects.toMatchObject({
			_tag: "PaginationMismatchError",
			message: "The API returned invalid pagination metadata",
		});
	});

	it("does not recover a member-path 404 while listing", async () => {
		const error = new HevyHttpError("not found", {
			status: 404,
			method: "GET",
			endpoint: "/v1/exercise_templates/template-1",
		});
		const operation = createTemplatesListAllOperation({
			getExerciseTemplates: vi
				.fn<TemplatesListAllAdapter["getExerciseTemplates"]>()
				.mockReturnValue(Effect.fail(error)),
		});

		await expect(Effect.runPromise(operation.effect())).rejects.toBe(error);
	});
});

describe("templates.search operation", () => {
	it("honors the page limit while filtering titles and forwarding options", async () => {
		const requests: Array<{
			readonly page: number;
			readonly pageSize: number;
			readonly options: { readonly timeoutMs: number } | undefined;
		}> = [];
		const getExerciseTemplates = vi.fn((params, options) => {
			const page = params?.page ?? 1;
			requests.push({ page, pageSize: params?.pageSize ?? 0, options });
			return Effect.succeed({
				page,
				page_count: 3,
				exercise_templates: [{ id: `template-${page}`, title: "Bench Press" }],
			});
		});
		const operation = createTemplatesSearchOperation({
			getExerciseTemplates,
		});
		const options = { timeoutMs: 1_000 };

		await expect(
			Effect.runPromise(
				operation.effect({ query: "BENCH", maxPages: 2 }, options),
			),
		).resolves.toEqual({
			matches: [
				{ id: "template-1", title: "Bench Press" },
				{ id: "template-2", title: "Bench Press" },
			],
			pages: 2,
			itemsScanned: 2,
			complete: false,
		});
		expect(requests).toEqual([
			{ page: 1, pageSize: 100, options },
			{ page: 2, pageSize: 100, options },
		]);
	});

	it.each([{ page_count: undefined }, { page_count: 1.5 }] as const)(
		"rejects malformed pagination metadata: %#",
		async (response) => {
			const getExerciseTemplates = vi.fn(() =>
				Effect.succeed({
					page: 1,
					page_count: response.page_count,
					exercise_templates: [],
				}),
			);
			const operation = createTemplatesSearchOperation({
				getExerciseTemplates,
			});

			await expect(
				Effect.runPromise(operation.effect({ query: "bench", maxPages: 10 })),
			).rejects.toMatchObject({
				_tag: "PaginationMismatchError",
				message: "The API returned invalid pagination metadata",
			});
		},
	);

	it("rejects a page count smaller than the requested page", async () => {
		const getExerciseTemplates = vi.fn((params) =>
			Effect.succeed({
				page: params?.page,
				page_count: params?.page === 1 ? 2 : 1,
				exercise_templates: [{ id: `template-${params?.page}` }],
			}),
		);
		const operation = createTemplatesSearchOperation({
			getExerciseTemplates,
		});

		await expect(
			Effect.runPromise(operation.effect({ query: "bench", maxPages: 10 })),
		).rejects.toMatchObject({
			_tag: "PaginationMismatchError",
			message: "The API returned invalid pagination metadata",
		});
	});

	it("rejects zero page count when a page contains templates", async () => {
		const operation = createTemplatesSearchOperation({
			getExerciseTemplates: () =>
				Effect.succeed({
					page: 1,
					page_count: 0,
					exercise_templates: [{ id: "template-1", title: "Bench" }],
				}),
		});

		await expect(
			Effect.runPromise(operation.effect({ query: "bench", maxPages: 10 })),
		).rejects.toMatchObject({
			_tag: "PaginationMismatchError",
			message: "The API returned invalid pagination metadata",
		});
	});
});
