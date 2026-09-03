import { Effect } from "effect";
import type {
	HevyExecutionOptions,
	HevyOperationSafety,
} from "@hevy-mcp/hevy-client";
import type { HevyRequestEffectClient } from "@hevy-mcp/hevy-client/internal";
import type { GetV1Routines200, Routine } from "@hevy-mcp/hevy-client/types";
import {
	isExpectedReadEndOfList,
	isExpectedReadNotFound,
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
	execute(
		input: RoutinesListInput,
		options?: HevyExecutionOptions,
	): Promise<RoutinesListOutput>;
}

function normalizeRoutinesPage(
	response: GetV1Routines200,
	input: RoutinesListInput,
): RoutinesListOutput {
	if (response.page !== undefined && response.page !== input.page) {
		throw new Error(
			`Routines page mismatch: requested page ${input.page} but received page ${response.page}`,
		);
	}
	return {
		items: response.routines ?? [],
		page: response.page ?? input.page,
		pageCount: response.page_count,
	};
}

export function createRoutinesGetOperation(
	adapter: RoutinesGetAdapter,
): RoutinesGetOperation {
	return {
		descriptor: routinesGetDescriptor,
		async execute(input, options) {
			const program = (
				options === undefined
					? adapter.getRoutineById(input.routineId)
					: adapter.getRoutineById(input.routineId, options)
			).pipe(
				Effect.map((response) => ({ routine: response.routine ?? null })),
				Effect.catchIf(
					(error) => isExpectedReadNotFound(error, "/v1/routines"),
					() =>
						Effect.succeed({
							routine: null,
							expected404Outcome: "not_found" as const,
						}),
				),
			);
			return Effect.runPromise(program);
		},
	};
}

export function createRoutinesListOperation(
	adapter: RoutinesListAdapter,
): RoutinesListOperation {
	return {
		descriptor: routinesListDescriptor,
		async execute(input, options) {
			const params = { page: input.page, pageSize: input.pageSize };
			const program = (
				options === undefined
					? adapter.getRoutines(params)
					: adapter.getRoutines(params, options)
			).pipe(
				Effect.map((response) => normalizeRoutinesPage(response, input)),
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
			return Effect.runPromise(program);
		},
	};
}
