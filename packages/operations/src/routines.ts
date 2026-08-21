import type {
	HevyClient,
	HevyExecutionOptions,
	HevyOperationSafety,
} from "@hevy-mcp/hevy-client";
import type { GetV1Routines200, Routine } from "@hevy-mcp/hevy-client/types";
import {
	canonicalEndpointIdentity,
	expectedGet404Outcome,
	isHevyHttpError,
} from "@hevy-mcp/hevy-client";

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

export type RoutinesListAdapter = Pick<HevyClient, "getRoutines">;

export interface RoutinesGetInput {
	readonly routineId: string;
}

export interface RoutinesGetOutput {
	readonly routine: Routine | null;
	readonly expected404Outcome?: "not_found";
}

export type RoutinesGetAdapter = Pick<HevyClient, "getRoutineById">;

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

type ErrorInput = Error | string;

function isExpectedEndOfList(error: ErrorInput, page: number): boolean {
	return (
		page > 1 &&
		isHevyHttpError(error) &&
		canonicalEndpointIdentity(error.endpoint) === "/v1/routines" &&
		expectedGet404Outcome(error.endpoint, error.method, error.status, page) ===
			"end_of_list"
	);
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

function isExpectedRoutineNotFound(error: ErrorInput): boolean {
	return (
		isHevyHttpError(error) &&
		canonicalEndpointIdentity(error.endpoint) === "/v1/routines/:routineId" &&
		expectedGet404Outcome(error.endpoint, error.method, error.status) ===
			"not_found"
	);
}

export function createRoutinesGetOperation(
	adapter: RoutinesGetAdapter,
): RoutinesGetOperation {
	return {
		descriptor: routinesGetDescriptor,
		async execute(input, options) {
			try {
				const response =
					options === undefined
						? await adapter.getRoutineById(input.routineId)
						: await adapter.getRoutineById(input.routineId, options);
				return { routine: response.routine ?? null };
			} catch (error) {
				if (
					isExpectedRoutineNotFound(
						error instanceof Error ? error : String(error),
					)
				) {
					return {
						routine: null,
						expected404Outcome: "not_found",
					};
				}
				throw error;
			}
		},
	};
}

export function createRoutinesListOperation(
	adapter: RoutinesListAdapter,
): RoutinesListOperation {
	return {
		descriptor: routinesListDescriptor,
		async execute(input, options) {
			try {
				const params = { page: input.page, pageSize: input.pageSize };
				const response =
					options === undefined
						? await adapter.getRoutines(params)
						: await adapter.getRoutines(params, options);
				return normalizeRoutinesPage(response, input);
			} catch (error) {
				if (
					isExpectedEndOfList(
						error instanceof Error ? error : String(error),
						input.page,
					)
				) {
					return {
						items: [],
						page: input.page,
						pageCount: undefined,
						expected404Outcome: "end_of_list",
					};
				}
				throw error;
			}
		},
	};
}
