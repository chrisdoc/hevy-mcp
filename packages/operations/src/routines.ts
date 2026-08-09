import type {
	HevyClient,
	HevyExecutionOptions,
	HevyHttpError,
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

function isExpectedEndOfList(error: unknown, page: number): boolean {
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
				if (isExpectedEndOfList(error, input.page)) {
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

export function isRoutinesListEndOfList(
	error: unknown,
	page: number,
): error is HevyHttpError {
	return isExpectedEndOfList(error, page);
}
