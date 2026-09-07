import { Effect, Option, Predicate, Stream } from "effect";
import { defineOperation } from "./define-operation.js";
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
	hasNextPage,
	isEmptyResponse,
	withExpectedEndOfList,
	withExpectedNotFound,
	PaginationMismatchError,
	TemplatesSearchValidationError,
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
	execute(options?: HevyExecutionOptions): Promise<TemplatesListAllResult>;
}

export interface TemplatesListAllResult {
	readonly items: ExerciseTemplate[];
	readonly pageCount: number;
}

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
		| HevyRequestEffectError
		| PaginationMismatchError
		| TemplatesSearchValidationError
	>;
	execute(
		input: TemplatesSearchInput,
		options?: HevyExecutionOptions,
	): Promise<TemplatesSearchOutput>;
}

const TEMPLATES_PAGE_SIZE = 100;
const TEMPLATES_SEARCH_MIN_PAGES = 1;
const TEMPLATES_SEARCH_MAX_PAGES = 100;

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

type ValidatedTemplatesPage = {
	readonly pageCount: number;
	readonly templates: ExerciseTemplate[];
	readonly hasNextPage: boolean;
};

/**
 * Shared pagination policy for both templates list operations: validates the
 * `page` echo and `page_count` metadata of a GetV1ExerciseTemplates response.
 * Missing or invalid `page_count` is rejected instead of being silently
 * treated as end-of-list, which would truncate results.
 */
function readTemplatesPage(
	response: GetV1ExerciseTemplates200,
	requestedPage: number,
): Effect.Effect<ValidatedTemplatesPage, PaginationMismatchError> {
	if (response?.page !== undefined && response.page !== requestedPage) {
		return Effect.fail(
			new PaginationMismatchError({
				requested: requestedPage,
				received: response.page,
				collection: "exerciseTemplates",
				message: `Exercise templates page mismatch: requested page ${requestedPage} but received page ${response.page}`,
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
		(pageCount > 0 && pageCount < requestedPage)
	) {
		return Effect.fail(
			new PaginationMismatchError({
				requested: requestedPage,
				received: Predicate.isNumber(pageCount) ? pageCount : -1,
				collection: "exerciseTemplates",
				message: "The API returned invalid pagination metadata",
			}),
		);
	}

	return Effect.succeed({
		pageCount,
		templates,
		hasNextPage: hasNextPage(pageCount, requestedPage, templates.length),
	});
}

export function createTemplatesGetOperation(
	adapter: TemplatesGetAdapter,
): TemplatesGetOperation {
	return defineOperation(
		templatesGetDescriptor,
		function* (input: TemplatesGetInput, options?: HevyExecutionOptions) {
			const request = adapter.getExerciseTemplate(
				input.exerciseTemplateId,
				options,
			);
			return yield* request.pipe(
				Effect.map((exerciseTemplate) => ({
					exerciseTemplate: isEmptyResponse(exerciseTemplate)
						? null
						: (exerciseTemplate ?? null),
					exerciseTemplateId: input.exerciseTemplateId,
				})),
				withExpectedNotFound("/v1/exercise_templates", {
					exerciseTemplate: null,
					exerciseTemplateId: input.exerciseTemplateId,
					expected404Outcome: "not_found" as const,
				}),
			);
		},
	);
}

export function createTemplatesHistoryOperation(
	adapter: TemplatesHistoryAdapter,
): TemplatesHistoryOperation {
	return defineOperation(
		templatesHistoryDescriptor,
		function* (input: TemplatesHistoryInput, options?: HevyExecutionOptions) {
			const params = exerciseHistoryQuery(input);
			const request = adapter.getExerciseHistory(
				input.exerciseTemplateId,
				params,
				options,
			);
			const response = yield* request;
			return {
				exerciseHistory: response?.exercise_history ?? [],
				exerciseTemplateId: input.exerciseTemplateId,
			};
		},
	);
}

export function createTemplatesCreateOperation(
	adapter: TemplatesCreateAdapter,
): TemplatesCreateOperation {
	return defineOperation(
		templatesCreateDescriptor,
		function* (input: TemplatesCreateInput, options?: HevyExecutionOptions) {
			const request = adapter.createExerciseTemplate(input, options);
			return yield* request;
		},
	);
}

export function createTemplatesListAllOperation(
	adapter: TemplatesListAllAdapter,
): TemplatesListAllOperation {
	return defineOperation(
		templatesListAllDescriptor,
		function* (options?: HevyExecutionOptions) {
			const pageStream = Stream.paginate<
				TemplatesListCursor,
				TemplatesListPage,
				HevyRequestEffectError | PaginationMismatchError
			>({ page: 1 }, (cursor) => {
				const params = { page: cursor.page, pageSize: TEMPLATES_PAGE_SIZE };
				const request = adapter.getExerciseTemplates(params, options);
				return request.pipe(
					Effect.flatMap((response: GetV1ExerciseTemplates200) =>
						readTemplatesPage(response, cursor.page).pipe(
							Effect.map(
								({ templates, hasNextPage }) =>
									[
										[{ templates }],
										hasNextPage
											? Option.some({ page: cursor.page + 1 })
											: Option.none(),
									] as const,
							),
						),
					),
					withExpectedEndOfList("/v1/exercise_templates", cursor.page, [
						[],
						Option.none<TemplatesListCursor>(),
					] as const),
				);
			});
			const pages = yield* Stream.runCollect(pageStream);
			return {
				items: pages.flatMap((page) => page.templates),
				pageCount: pages.length,
			};
		},
	);
}

export function createTemplatesSearchOperation(
	adapter: TemplatesListAllAdapter,
): TemplatesSearchOperation {
	return defineOperation(
		templatesSearchDescriptor,
		function* (input: TemplatesSearchInput, options?: HevyExecutionOptions) {
			if (
				!Number.isInteger(input.maxPages) ||
				input.maxPages < TEMPLATES_SEARCH_MIN_PAGES ||
				input.maxPages > TEMPLATES_SEARCH_MAX_PAGES
			) {
				return yield* new TemplatesSearchValidationError({
					maxPages: input.maxPages,
					message: `Templates search maxPages must be an integer from ${TEMPLATES_SEARCH_MIN_PAGES} through ${TEMPLATES_SEARCH_MAX_PAGES}`,
				});
			}
			const maxPages = input.maxPages;
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
				const request = adapter.getExerciseTemplates(params, options);
				return request.pipe(
					Effect.flatMap((response: GetV1ExerciseTemplates200) =>
						readTemplatesPage(response, cursor.page).pipe(
							Effect.map(
								({ templates, hasNextPage }) =>
									[
										[
											{
												templates,
												hasNextPage,
											},
										],
										hasNextPage && cursor.page < maxPages
											? Option.some({ page: cursor.page + 1 })
											: Option.none(),
									] as const,
							),
						),
					),
					withExpectedEndOfList("/v1/exercise_templates", cursor.page, [
						[
							{
								templates: [] as ExerciseTemplate[],
								hasNextPage: false,
								endOfList: true,
							},
						],
						Option.none<TemplatesSearchCursor>(),
					] as const),
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
					pages.at(-1)?.endOfList === true ||
					pages.at(-1)?.hasNextPage !== true,
			};
		},
	);
}
