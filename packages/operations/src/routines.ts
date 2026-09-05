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
	GetV1Routines200,
	PostV1Routines201,
	PutV1RoutinesRoutineid200,
	Routine,
} from "@hevy-mcp/hevy-client/types";
import {
	buildRoutinePayload,
	type RoutinePayloadInput,
} from "./mutation-semantics.js";
import {
	isExpectedReadEndOfList,
	isExpectedReadNotFound,
	PaginationMismatchError,
} from "./operation-errors.js";

export interface RoutinesListInput {
	readonly page: number;
	readonly pageSize: number;
}

export interface RoutinesListOutput {
	readonly items: Routine[];
	readonly page: number;
	readonly pageCount?: number;
	readonly expected404Outcome?: "end_of_list";
}

export type RoutinesListAdapter = Pick<HevyRequestEffectClient, "getRoutines">;

export interface RoutinesGetInput {
	readonly routineId: string;
}

export interface RoutinesGetOutput {
	readonly routine: Routine | null;
	readonly expected404Outcome?: "not_found";
}

export type RoutinesGetAdapter = Pick<
	HevyRequestEffectClient,
	"getRoutineById"
>;

export type RoutinesCreateInput = {
	readonly routine: RoutinePayloadInput;
};

export type RoutinesCreateAdapter = Pick<
	HevyRequestEffectClient,
	"createRoutine"
>;

export interface RoutinesCreateOutput {
	readonly routine: Routine | undefined;
	readonly usesRepRanges: boolean;
}

export interface RoutinesCreateDescriptor {
	readonly id: "routines.create";
	readonly safety: Extract<HevyOperationSafety, "non-idempotent-write">;
}

export const routinesCreateDescriptor: RoutinesCreateDescriptor = {
	id: "routines.create",
	safety: "non-idempotent-write",
};

export interface RoutinesCreateOperation {
	readonly descriptor: RoutinesCreateDescriptor;
	readonly effect: (
		input: RoutinesCreateInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<RoutinesCreateOutput, HevyRequestEffectError>;
	execute(
		input: RoutinesCreateInput,
		options?: HevyExecutionOptions,
	): Promise<RoutinesCreateOutput>;
}

export type RoutinesUpdateInput =
	| {
			readonly routineId: string;
			readonly routine: RoutinePayloadInput;
	  }
	| {
			readonly routineId: string;
			readonly patch: RoutinePayloadInput;
	  };

export type RoutinesUpdateAdapter = Pick<
	HevyRequestEffectClient,
	"updateRoutine"
>;

export interface RoutinesUpdateOutput {
	readonly routine: Routine | undefined;
	readonly usesRepRanges: boolean;
}

export interface RoutinesUpdateDescriptor {
	readonly id: "routines.update";
	readonly safety: Extract<HevyOperationSafety, "idempotent-write">;
}

export const routinesUpdateDescriptor: RoutinesUpdateDescriptor = {
	id: "routines.update",
	safety: "idempotent-write",
};

export interface RoutinesUpdateOperation {
	readonly descriptor: RoutinesUpdateDescriptor;
	readonly effect: (
		input: RoutinesUpdateInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<RoutinesUpdateOutput, HevyRequestEffectError>;
	execute(
		input: RoutinesUpdateInput,
		options?: HevyExecutionOptions,
	): Promise<RoutinesUpdateOutput>;
}

export interface RoutinesSearchInput {
	readonly query?: string;
	readonly limit?: number;
}

export type RoutinesSearchAdapter = Pick<
	HevyRequestEffectClient,
	"getRoutines"
>;

export interface RoutinesSearchOutput {
	readonly routines: Routine[];
	readonly pages: number;
	readonly itemsScanned: number;
}

export interface RoutinesSearchDescriptor {
	readonly id: "routines.search";
	readonly safety: Extract<HevyOperationSafety, "read">;
}

export const routinesSearchDescriptor: RoutinesSearchDescriptor = {
	id: "routines.search",
	safety: "read",
};

export interface RoutinesSearchOperation {
	readonly descriptor: RoutinesSearchDescriptor;
	readonly effect: (
		input: RoutinesSearchInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<
		RoutinesSearchOutput,
		HevyRequestEffectError | PaginationMismatchError
	>;
	execute(
		input: RoutinesSearchInput,
		options?: HevyExecutionOptions,
	): Promise<RoutinesSearchOutput>;
}

export interface RoutinesGetDescriptor {
	readonly id: "routines.get";
	readonly safety: Extract<HevyOperationSafety, "read">;
}

export const routinesGetDescriptor: RoutinesGetDescriptor = {
	id: "routines.get",
	safety: "read",
};

export interface RoutinesGetOperation {
	readonly descriptor: RoutinesGetDescriptor;
	readonly effect: (
		input: RoutinesGetInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<RoutinesGetOutput, HevyRequestEffectError>;
	execute(
		input: RoutinesGetInput,
		options?: HevyExecutionOptions,
	): Promise<RoutinesGetOutput>;
}

export interface RoutinesListDescriptor {
	readonly id: "routines.list";
	readonly safety: Extract<HevyOperationSafety, "read">;
}

export const routinesListDescriptor: RoutinesListDescriptor = {
	id: "routines.list",
	safety: "read",
};

export interface RoutinesListOperation {
	readonly descriptor: RoutinesListDescriptor;
	readonly effect: (
		input: RoutinesListInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<
		RoutinesListOutput,
		HevyRequestEffectError | PaginationMismatchError
	>;
	execute(
		input: RoutinesListInput,
		options?: HevyExecutionOptions,
	): Promise<RoutinesListOutput>;
}

const DEFAULT_ROUTINE_SEARCH_LIMIT = 20;
const MAX_ROUTINE_SEARCH_LIMIT = 100;
const ROUTINE_SEARCH_PAGE_SIZE = 10;

function normalizeRoutineResponse(
	response: PostV1Routines201 | PutV1RoutinesRoutineid200,
): Routine | undefined {
	if (Predicate.isObject(response) && Object.keys(response).length === 0) {
		return undefined;
	}
	return response as Routine;
}

export function createRoutinesCreateOperation(
	adapter: RoutinesCreateAdapter,
): RoutinesCreateOperation {
	const effect = Effect.fn("operations.routines.create")(function* (
		input: RoutinesCreateInput,
		options?: HevyExecutionOptions,
	) {
		const { payload, usesRepRanges } = buildRoutinePayload(
			input.routine,
			"create",
		);
		const request =
			options === undefined
				? adapter.createRoutine({ routine: payload })
				: adapter.createRoutine({ routine: payload }, options);
		const response = yield* request;
		return {
			routine: normalizeRoutineResponse(response),
			usesRepRanges,
		};
	});

	const operation: RoutinesCreateOperation = {
		descriptor: routinesCreateDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

export function createRoutinesUpdateOperation(
	adapter: RoutinesUpdateAdapter,
): RoutinesUpdateOperation {
	const effect = Effect.fn("operations.routines.update")(function* (
		input: RoutinesUpdateInput,
		options?: HevyExecutionOptions,
	) {
		const { payload, usesRepRanges } = buildRoutinePayload(
			"routine" in input ? input.routine : input.patch,
			"update",
		);
		const request =
			options === undefined
				? adapter.updateRoutine(input.routineId, { routine: payload })
				: adapter.updateRoutine(input.routineId, { routine: payload }, options);
		const response = yield* request;
		return {
			routine: normalizeRoutineResponse(response),
			usesRepRanges,
		};
	});

	const operation: RoutinesUpdateOperation = {
		descriptor: routinesUpdateDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

type RoutinesSearchCursor = {
	readonly page: number;
	readonly matches: number;
};

type RoutinesSearchPage = {
	readonly routines: Routine[];
};

function isSearchPageCount(value: number | undefined): value is number {
	return Predicate.isNumber(value) && Number.isSafeInteger(value) && value > 0;
}

export function createRoutinesSearchOperation(
	adapter: RoutinesSearchAdapter,
): RoutinesSearchOperation {
	const effect = Effect.fn("operations.routines.search")(function* (
		input: RoutinesSearchInput,
		options?: HevyExecutionOptions,
	) {
		const normalizedQuery = input.query?.toLowerCase();
		const limit = Math.min(
			Math.max(input.limit ?? DEFAULT_ROUTINE_SEARCH_LIMIT, 0),
			MAX_ROUTINE_SEARCH_LIMIT,
		);
		const pageStream = Stream.paginate<
			RoutinesSearchCursor,
			RoutinesSearchPage,
			HevyRequestEffectError | PaginationMismatchError
		>({ page: 1, matches: 0 }, (cursor) => {
			if (limit === 0) {
				return Effect.succeed([[], Option.none()]);
			}
			const params = {
				page: cursor.page,
				pageSize: ROUTINE_SEARCH_PAGE_SIZE,
			};
			const request =
				options === undefined
					? adapter.getRoutines(params)
					: adapter.getRoutines(params, options);
			return request.pipe(
				Effect.flatMap((response: GetV1Routines200) => {
					if (response.page !== undefined && response.page !== cursor.page) {
						return Effect.fail(
							new PaginationMismatchError({
								requested: cursor.page,
								received: response.page,
								collection: "routines",
								message: `Routines page mismatch: requested page ${cursor.page} but received page ${response.page}`,
							}),
						);
					}

					const routines = response.routines ?? [];
					const pageMatches = routines.filter((routine) =>
						normalizedQuery === undefined
							? true
							: (routine.title?.toLowerCase().includes(normalizedQuery) ??
								false),
					);
					const matches = cursor.matches + pageMatches.length;
					const hasNextPage =
						matches < limit &&
						routines.length > 0 &&
						isSearchPageCount(response.page_count) &&
						response.page_count > cursor.page;
					return Effect.succeed([
						[{ routines }],
						hasNextPage
							? Option.some({
									page: cursor.page + 1,
									matches,
								})
							: Option.none(),
					] as const);
				}),
				Effect.catchIf(
					(error) =>
						isExpectedReadEndOfList(error, "/v1/routines", cursor.page),
					() =>
						Effect.succeed([[], Option.none<RoutinesSearchCursor>()] as const),
				),
			);
		});
		const pages = yield* Stream.runCollect(pageStream);
		const routines = pages
			.flatMap((page) => page.routines)
			.filter((routine) =>
				normalizedQuery === undefined
					? true
					: (routine.title?.toLowerCase().includes(normalizedQuery) ?? false),
			);
		return {
			routines: routines.slice(0, limit),
			pages: pages.length,
			itemsScanned: pages.reduce(
				(total, page) => total + page.routines.length,
				0,
			),
		};
	});

	const operation: RoutinesSearchOperation = {
		descriptor: routinesSearchDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

export function createRoutinesGetOperation(
	adapter: RoutinesGetAdapter,
): RoutinesGetOperation {
	const effect = Effect.fn("operations.routines.get")(function* (
		input: RoutinesGetInput,
		options?: HevyExecutionOptions,
	) {
		const request =
			options === undefined
				? adapter.getRoutineById(input.routineId)
				: adapter.getRoutineById(input.routineId, options);
		return yield* request.pipe(
			Effect.map((response) => ({ routine: response?.routine ?? null })),
			Effect.catchIf(
				(error) => isExpectedReadNotFound(error, "/v1/routines"),
				() =>
					Effect.succeed({
						routine: null,
						expected404Outcome: "not_found" as const,
					}),
			),
		);
	});

	const operation: RoutinesGetOperation = {
		descriptor: routinesGetDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

export function createRoutinesListOperation(
	adapter: RoutinesListAdapter,
): RoutinesListOperation {
	const effect = Effect.fn("operations.routines.list")(function* (
		input: RoutinesListInput,
		options?: HevyExecutionOptions,
	) {
		const params = { page: input.page, pageSize: input.pageSize };
		const request =
			options === undefined
				? adapter.getRoutines(params)
				: adapter.getRoutines(params, options);
		return yield* request.pipe(
			Effect.flatMap((response: GetV1Routines200) => {
				if (response.page !== undefined && response.page !== input.page) {
					return Effect.fail(
						new PaginationMismatchError({
							requested: input.page,
							received: response.page,
							collection: "routines",
							message: `Routines page mismatch: requested page ${input.page} but received page ${response.page}`,
						}),
					);
				}
				return Effect.succeed({
					items: response.routines ?? [],
					page: response.page ?? input.page,
					pageCount: response.page_count,
				});
			}),
			Effect.catchIf(
				(error) => isExpectedReadEndOfList(error, "/v1/routines", input.page),
				() =>
					Effect.succeed({
						items: [],
						page: input.page,
						pageCount: undefined,
						expected404Outcome: "end_of_list" as const,
					}),
			),
		);
	});

	const operation: RoutinesListOperation = {
		descriptor: routinesListDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}
