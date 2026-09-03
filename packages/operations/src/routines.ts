import { Effect } from "effect";
import type {
	HevyExecutionOptions,
	HevyOperationSafety,
} from "@hevy-mcp/hevy-client";
import type {
	HevyRequestEffectClient,
	HevyRequestEffectError,
} from "@hevy-mcp/hevy-client/internal";
import type { GetV1Routines200, Routine } from "@hevy-mcp/hevy-client/types";
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
