import { Effect, Option, Stream } from "effect";
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
	assertPageEcho,
	hasNextPage,
	isEmptyResponse,
	withExpectedEndOfList,
	withExpectedNotFound,
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
	if (isEmptyResponse(response)) {
		return undefined;
	}
	return response as Routine;
}

export function createRoutinesCreateOperation(
	adapter: RoutinesCreateAdapter,
): RoutinesCreateOperation {
	return defineOperation(
		routinesCreateDescriptor,
		function* (input: RoutinesCreateInput, options?: HevyExecutionOptions) {
			const { payload, usesRepRanges } = buildRoutinePayload(
				input.routine,
				"create",
			);
			const request = adapter.createRoutine({ routine: payload }, options);
			const response = yield* request;
			return {
				routine: normalizeRoutineResponse(response),
				usesRepRanges,
			};
		},
	);
}

export function createRoutinesUpdateOperation(
	adapter: RoutinesUpdateAdapter,
): RoutinesUpdateOperation {
	return defineOperation(
		routinesUpdateDescriptor,
		function* (input: RoutinesUpdateInput, options?: HevyExecutionOptions) {
			const { payload, usesRepRanges } = buildRoutinePayload(
				"routine" in input ? input.routine : input.patch,
				"update",
			);
			const request = adapter.updateRoutine(
				input.routineId,
				{ routine: payload },
				options,
			);
			const response = yield* request;
			return {
				routine: normalizeRoutineResponse(response),
				usesRepRanges,
			};
		},
	);
}

type RoutinesSearchCursor = {
	readonly page: number;
	readonly matches: number;
};

type RoutinesSearchPage = {
	readonly matches: Routine[];
	readonly scanned: number;
};

export function createRoutinesSearchOperation(
	adapter: RoutinesSearchAdapter,
): RoutinesSearchOperation {
	return defineOperation(
		routinesSearchDescriptor,
		function* (input: RoutinesSearchInput, options?: HevyExecutionOptions) {
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
				const request = adapter.getRoutines(params, options);
				return request.pipe(
					Effect.tap((response) =>
						assertPageEcho(response, cursor.page, "routines"),
					),
					Effect.map((response: GetV1Routines200) => {
						const routines = response.routines ?? [];
						const pageMatches = routines.filter((routine) =>
							normalizedQuery === undefined
								? true
								: (routine.title?.toLowerCase().includes(normalizedQuery) ??
									false),
						);
						const matches = cursor.matches + pageMatches.length;
						const continuePaging =
							matches < limit &&
							hasNextPage(response.page_count, cursor.page, routines.length);
						return [
							[{ matches: pageMatches, scanned: routines.length }],
							continuePaging
								? Option.some({
										page: cursor.page + 1,
										matches,
									})
								: Option.none(),
						] as const;
					}),
					withExpectedEndOfList("/v1/routines", cursor.page, [
						[],
						Option.none<RoutinesSearchCursor>(),
					] as const),
				);
			});
			const pages = yield* Stream.runCollect(pageStream);
			const matches = pages.flatMap((page) => page.matches);
			return {
				routines: matches.slice(0, limit),
				pages: pages.length,
				itemsScanned: pages.reduce((total, page) => total + page.scanned, 0),
			};
		},
	);
}

export function createRoutinesGetOperation(
	adapter: RoutinesGetAdapter,
): RoutinesGetOperation {
	return defineOperation(
		routinesGetDescriptor,
		function* (input: RoutinesGetInput, options?: HevyExecutionOptions) {
			const request = adapter.getRoutineById(input.routineId, options);
			return yield* request.pipe(
				Effect.map((response) => ({ routine: response?.routine ?? null })),
				withExpectedNotFound("/v1/routines", {
					routine: null,
					expected404Outcome: "not_found" as const,
				}),
			);
		},
	);
}

export function createRoutinesListOperation(
	adapter: RoutinesListAdapter,
): RoutinesListOperation {
	return defineOperation(
		routinesListDescriptor,
		function* (input: RoutinesListInput, options?: HevyExecutionOptions) {
			const params = { page: input.page, pageSize: input.pageSize };
			const request = adapter.getRoutines(params, options);
			return yield* request.pipe(
				Effect.tap((response) =>
					assertPageEcho(response, input.page, "routines"),
				),
				Effect.map((response: GetV1Routines200) => ({
					items: response.routines ?? [],
					page: response.page ?? input.page,
					pageCount: response.page_count,
				})),
				withExpectedEndOfList("/v1/routines", input.page, {
					items: [],
					page: input.page,
					pageCount: undefined,
					expected404Outcome: "end_of_list" as const,
				}),
			);
		},
	);
}
