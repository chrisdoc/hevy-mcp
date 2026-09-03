import { Effect, Option, Predicate, Stream } from "effect";
import type {
	HevyExecutionOptions,
	HevyOperationSafety,
} from "@hevy-mcp/hevy-client";
import type {
	HevyRequestEffectClient,
	HevyRequestEffectError,
} from "@hevy-mcp/hevy-client/internal";
import type {
	CreateCustomExerciseRequestBody,
	ExerciseHistoryEntry,
	ExerciseTemplate,
	GetV1ExerciseTemplates200,
	PostV1ExerciseTemplates200,
} from "@hevy-mcp/hevy-client/types";
import {
	isExpectedReadEndOfList,
	isExpectedReadNotFound,
	PaginationMismatchError,
} from "./operation-errors.js";

export interface TemplatesGetInput {
	readonly exerciseTemplateId: string;
}

export interface TemplatesGetOutput {
	readonly exerciseTemplate: ExerciseTemplate | null;
	readonly exerciseTemplateId: string;
	readonly expected404Outcome?: "not_found";
}

export type TemplatesGetAdapter = Pick<
	HevyRequestEffectClient,
	"getExerciseTemplate"
>;

export interface TemplatesGetDescriptor {
	readonly id: "templates.get";
	readonly safety: Extract<HevyOperationSafety, "read">;
}

export const templatesGetDescriptor: TemplatesGetDescriptor = {
	id: "templates.get",
	safety: "read",
};

export interface TemplatesGetOperation {
	readonly descriptor: TemplatesGetDescriptor;
	readonly effect: (
		input: TemplatesGetInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<TemplatesGetOutput, HevyRequestEffectError>;
	execute(
		input: TemplatesGetInput,
		options?: HevyExecutionOptions,
	): Promise<TemplatesGetOutput>;
}

export interface TemplatesHistoryInput {
	readonly exerciseTemplateId: string;
	readonly startDate?: string;
	readonly endDate?: string;
}

type ExerciseHistoryQuery = {
	readonly start_date?: string;
	readonly end_date?: string;
};

function exerciseHistoryQuery(
	input: TemplatesHistoryInput,
): ExerciseHistoryQuery {
	if (input.startDate === undefined && input.endDate === undefined) {
		return {};
	}
	if (input.startDate === undefined) {
		return { end_date: input.endDate };
	}
	if (input.endDate === undefined) {
		return { start_date: input.startDate };
	}
	return {
		start_date: input.startDate,
		end_date: input.endDate,
	};
}

export interface TemplatesHistoryOutput {
	readonly exerciseHistory: ExerciseHistoryEntry[];
	readonly exerciseTemplateId: string;
}

export type TemplatesHistoryAdapter = Pick<
	HevyRequestEffectClient,
	"getExerciseHistory"
>;

export interface TemplatesHistoryDescriptor {
	readonly id: "templates.history";
	readonly safety: Extract<HevyOperationSafety, "read">;
}

export const templatesHistoryDescriptor: TemplatesHistoryDescriptor = {
	id: "templates.history",
	safety: "read",
};

export interface TemplatesHistoryOperation {
	readonly descriptor: TemplatesHistoryDescriptor;
	readonly effect: (
		input: TemplatesHistoryInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<TemplatesHistoryOutput, HevyRequestEffectError>;
	execute(
		input: TemplatesHistoryInput,
		options?: HevyExecutionOptions,
	): Promise<TemplatesHistoryOutput>;
}

export type TemplatesCreateInput = CreateCustomExerciseRequestBody;

export type TemplatesCreateAdapter = Pick<
	HevyRequestEffectClient,
	"createExerciseTemplate"
>;

export interface TemplatesCreateDescriptor {
	readonly id: "templates.create";
	readonly safety: Extract<HevyOperationSafety, "non-idempotent-write">;
}

export const templatesCreateDescriptor: TemplatesCreateDescriptor = {
	id: "templates.create",
	safety: "non-idempotent-write",
};

export interface TemplatesCreateOperation {
	readonly descriptor: TemplatesCreateDescriptor;
	readonly effect: (
		input: TemplatesCreateInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<PostV1ExerciseTemplates200, HevyRequestEffectError>;
	execute(
		input: TemplatesCreateInput,
		options?: HevyExecutionOptions,
	): Promise<PostV1ExerciseTemplates200>;
}

export type TemplatesListAllAdapter = Pick<
	HevyRequestEffectClient,
	"getExerciseTemplates"
>;

export interface TemplatesListAllDescriptor {
	readonly id: "templates.listAll";
	readonly safety: Extract<HevyOperationSafety, "read">;
}

export const templatesListAllDescriptor: TemplatesListAllDescriptor = {
	id: "templates.listAll",
	safety: "read",
};

export interface TemplatesListAllOperation {
	readonly descriptor: TemplatesListAllDescriptor;
	readonly effect: (
		options?: HevyExecutionOptions,
	) => Effect.Effect<
		TemplatesListAllResult,
		HevyRequestEffectError | PaginationMismatchError
	>;
	execute(options?: HevyExecutionOptions): Promise<ExerciseTemplate[]>;
}

export type TemplatesListAllResult = ExerciseTemplate[] & {
	readonly pageCount?: number;
};

export interface TemplatesSearchInput {
	readonly query: string;
	readonly maxPages: number;
}

export interface TemplatesSearchOutput {
	readonly matches: ExerciseTemplate[];
	readonly pages: number;
	readonly itemsScanned: number;
	readonly complete: boolean;
}

export interface TemplatesSearchDescriptor {
	readonly id: "templates.search";
	readonly safety: Extract<HevyOperationSafety, "read">;
}

export const templatesSearchDescriptor: TemplatesSearchDescriptor = {
	id: "templates.search",
	safety: "read",
};

export interface TemplatesSearchOperation {
	readonly descriptor: TemplatesSearchDescriptor;
	readonly effect: (
		input: TemplatesSearchInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<
		TemplatesSearchOutput,
		HevyRequestEffectError | PaginationMismatchError
	>;
	execute(
		input: TemplatesSearchInput,
		options?: HevyExecutionOptions,
	): Promise<TemplatesSearchOutput>;
}

const TEMPLATES_PAGE_SIZE = 100;

type TemplatesListCursor = {
	readonly page: number;
};

type TemplatesListPage = {
	readonly templates: ExerciseTemplate[];
};

type TemplatesSearchCursor = {
	readonly page: number;
};

type TemplatesSearchPage = {
	readonly templates: ExerciseTemplate[];
	readonly hasNextPage: boolean;
	readonly endOfList?: boolean;
};

function hasNextTemplatesPage(
	pageCount: number | undefined,
	page: number,
	templates: readonly ExerciseTemplate[],
): boolean {
	return (
		templates.length > 0 &&
		Predicate.isNumber(pageCount) &&
		Number.isSafeInteger(pageCount) &&
		pageCount > page
	);
}

export function createTemplatesGetOperation(
	adapter: TemplatesGetAdapter,
): TemplatesGetOperation {
	const effect = Effect.fn("operations.templates.get")(function* (
		input: TemplatesGetInput,
		options?: HevyExecutionOptions,
	) {
		const request =
			options === undefined
				? adapter.getExerciseTemplate(input.exerciseTemplateId)
				: adapter.getExerciseTemplate(input.exerciseTemplateId, options);
		return yield* request.pipe(
			Effect.map((exerciseTemplate) => ({
				exerciseTemplate: isEmptyResponse(exerciseTemplate)
					? null
					: (exerciseTemplate ?? null),
				exerciseTemplateId: input.exerciseTemplateId,
			})),
			Effect.catchIf(
				(error) => isExpectedReadNotFound(error, "/v1/exercise_templates"),
				() =>
					Effect.succeed({
						exerciseTemplate: null,
						exerciseTemplateId: input.exerciseTemplateId,
						expected404Outcome: "not_found" as const,
					}),
			),
		);
	});

	const operation: TemplatesGetOperation = {
		descriptor: templatesGetDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

function isEmptyResponse<T extends object>(
	response: T | null | undefined,
): response is T & Record<never, never> {
	return (
		response !== null &&
		response !== undefined &&
		Object.keys(response).length === 0
	);
}

export function createTemplatesHistoryOperation(
	adapter: TemplatesHistoryAdapter,
): TemplatesHistoryOperation {
	const effect = Effect.fn("operations.templates.history")(function* (
		input: TemplatesHistoryInput,
		options?: HevyExecutionOptions,
	) {
		const params = exerciseHistoryQuery(input);
		const request =
			options === undefined
				? adapter.getExerciseHistory(input.exerciseTemplateId, params)
				: adapter.getExerciseHistory(input.exerciseTemplateId, params, options);
		const response = yield* request;
		return {
			exerciseHistory: response?.exercise_history ?? [],
			exerciseTemplateId: input.exerciseTemplateId,
		};
	});

	const operation: TemplatesHistoryOperation = {
		descriptor: templatesHistoryDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

export function createTemplatesCreateOperation(
	adapter: TemplatesCreateAdapter,
): TemplatesCreateOperation {
	const effect = Effect.fn("operations.templates.create")(function* (
		input: TemplatesCreateInput,
		options?: HevyExecutionOptions,
	) {
		const request =
			options === undefined
				? adapter.createExerciseTemplate(input)
				: adapter.createExerciseTemplate(input, options);
		return yield* request;
	});

	const operation: TemplatesCreateOperation = {
		descriptor: templatesCreateDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

export function createTemplatesListAllOperation(
	adapter: TemplatesListAllAdapter,
): TemplatesListAllOperation {
	const effect = Effect.fn("operations.templates.listAll")(function* (
		options?: HevyExecutionOptions,
	) {
		const pageStream = Stream.paginate<
			TemplatesListCursor,
			TemplatesListPage,
			HevyRequestEffectError | PaginationMismatchError
		>({ page: 1 }, (cursor) => {
			const params = { page: cursor.page, pageSize: TEMPLATES_PAGE_SIZE };
			const request =
				options === undefined
					? adapter.getExerciseTemplates(params)
					: adapter.getExerciseTemplates(params, options);
			return request.pipe(
				Effect.flatMap((response: GetV1ExerciseTemplates200) => {
					if (response?.page !== undefined && response.page !== cursor.page) {
						return Effect.fail(
							new PaginationMismatchError({
								requested: cursor.page,
								received: response.page,
								collection: "exerciseTemplates",
								message: `Exercise templates page mismatch: requested page ${cursor.page} but received page ${response.page}`,
							}),
						);
					}

					const templates = response?.exercise_templates ?? [];
					return Effect.succeed([
						[{ templates }],
						hasNextTemplatesPage(response?.page_count, cursor.page, templates)
							? Option.some({ page: cursor.page + 1 })
							: Option.none(),
					] as const);
				}),
				Effect.catchIf(
					(error) =>
						isExpectedReadEndOfList(
							error,
							"/v1/exercise_templates",
							cursor.page,
						),
					() =>
						Effect.succeed([[], Option.none<TemplatesListCursor>()] as const),
				),
			);
		});
		const pages = yield* Stream.runCollect(pageStream);
		const templates = pages.flatMap(
			(page) => page.templates,
		) as TemplatesListAllResult;
		Object.defineProperty(templates, "pageCount", {
			configurable: false,
			enumerable: false,
			value: pages.length,
			writable: false,
		});
		return templates;
	});

	const operation: TemplatesListAllOperation = {
		descriptor: templatesListAllDescriptor,
		effect,
		execute(options) {
			return Effect.runPromise(operation.effect(options));
		},
	};
	return operation;
}

export function createTemplatesSearchOperation(
	adapter: TemplatesListAllAdapter,
): TemplatesSearchOperation {
	const effect = Effect.fn("operations.templates.search")(function* (
		input: TemplatesSearchInput,
		options?: HevyExecutionOptions,
	) {
		const maxPages = Math.max(0, Math.min(input.maxPages, 100));
		const query = input.query.toLowerCase();
		const pageStream = Stream.paginate<
			TemplatesSearchCursor,
			TemplatesSearchPage,
			HevyRequestEffectError | PaginationMismatchError
		>({ page: 1 }, (cursor) => {
			if (cursor.page > maxPages) {
				return Effect.succeed([
					[] as ReadonlyArray<TemplatesSearchPage>,
					Option.none<TemplatesSearchCursor>(),
				] as const);
			}
			const params = { page: cursor.page, pageSize: TEMPLATES_PAGE_SIZE };
			const request =
				options === undefined
					? adapter.getExerciseTemplates(params)
					: adapter.getExerciseTemplates(params, options);
			return request.pipe(
				Effect.flatMap((response: GetV1ExerciseTemplates200) => {
					if (response?.page !== undefined && response.page !== cursor.page) {
						return Effect.fail(
							new PaginationMismatchError({
								requested: cursor.page,
								received: response.page,
								collection: "exerciseTemplates",
								message: `Exercise templates page mismatch: requested page ${cursor.page} but received page ${response.page}`,
							}),
						);
					}

					const pageCount = response?.page_count;
					const templates = response?.exercise_templates ?? [];
					if (
						!Predicate.isNumber(pageCount) ||
						!Number.isSafeInteger(pageCount) ||
						pageCount < 0 ||
						(pageCount === 0 && templates.length > 0) ||
						(pageCount > 0 && pageCount < cursor.page)
					) {
						return Effect.fail(
							new PaginationMismatchError({
								requested: cursor.page,
								received: Predicate.isNumber(pageCount) ? pageCount : -1,
								collection: "exerciseTemplates",
								message: "The API returned invalid pagination metadata",
							}),
						);
					}
					const hasNextPage = hasNextTemplatesPage(
						pageCount,
						cursor.page,
						templates,
					);
					return Effect.succeed([
						[
							{
								templates,
								hasNextPage,
							},
						],
						hasNextPage && cursor.page < maxPages
							? Option.some({ page: cursor.page + 1 })
							: Option.none(),
					] as const);
				}),
				Effect.catchIf(
					(error) =>
						isExpectedReadEndOfList(
							error,
							"/v1/exercise_templates",
							cursor.page,
						),
					() =>
						Effect.succeed([
							[
								{
									templates: [] as ExerciseTemplate[],
									hasNextPage: false,
									endOfList: true,
								},
							],
							Option.none<TemplatesSearchCursor>(),
						] as const),
				),
			);
		});
		const pages = yield* Stream.runCollect(pageStream);
		const scannedPages = pages.filter((page) => !page.endOfList);
		const matches = scannedPages.flatMap((page) =>
			page.templates.filter((template) =>
				template.title?.toLowerCase().includes(query),
			),
		);
		return {
			matches,
			pages: scannedPages.length,
			itemsScanned: scannedPages.reduce(
				(total, page) => total + page.templates.length,
				0,
			),
			complete:
				pages.at(-1)?.endOfList === true || pages.at(-1)?.hasNextPage !== true,
		};
	});

	const operation: TemplatesSearchOperation = {
		descriptor: templatesSearchDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}
