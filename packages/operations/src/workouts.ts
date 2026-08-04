import type {
	HevyClient,
	HevyExecutionOptions,
	HevyHttpError,
	HevyOperationSafety,
} from "@hevy-mcp/hevy-client";
import type { GetV1Workouts200, Workout } from "@hevy-mcp/hevy-client/types";
import { isHevyHttpError } from "@hevy-mcp/hevy-client";

export interface WorkoutsListInput {
	readonly page: number;
	readonly pageSize: number;
}

export interface WorkoutsListOutput {
	readonly items: Workout[];
	readonly page: number;
	readonly pageCount?: number;
	readonly expected404Outcome?: "end_of_list";
}

export type WorkoutsListAdapter = Pick<HevyClient, "getWorkouts">;

export interface WorkoutsListDescriptor {
	readonly id: "workouts.list";
	readonly safety: Extract<HevyOperationSafety, "read">;
}

export const workoutsListDescriptor: WorkoutsListDescriptor = {
	id: "workouts.list",
	safety: "read",
};

export interface WorkoutsListOperation {
	readonly descriptor: WorkoutsListDescriptor;
	execute(
		input: WorkoutsListInput,
		options?: HevyExecutionOptions,
	): Promise<WorkoutsListOutput>;
}

function isExpectedEndOfList(error: unknown, page: number): boolean {
	return (
		page > 1 &&
		isHevyHttpError(error) &&
		error.status === 404 &&
		error.method.toUpperCase() === "GET" &&
		error.endpoint === "/v1/workouts"
	);
}

function normalizeWorkoutsPage(
	response: GetV1Workouts200,
	input: WorkoutsListInput,
): WorkoutsListOutput {
	return {
		items: response.workouts ?? [],
		page: response.page ?? input.page,
		pageCount: response.page_count,
	};
}

export function createWorkoutsListOperation(
	adapter: WorkoutsListAdapter,
): WorkoutsListOperation {
	return {
		descriptor: workoutsListDescriptor,
		async execute(input, options) {
			try {
				const params = { page: input.page, pageSize: input.pageSize };
				const response =
					options === undefined
						? await adapter.getWorkouts(params)
						: await adapter.getWorkouts(params, options);
				return normalizeWorkoutsPage(response, input);
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

export function isWorkoutsListEndOfList(
	error: unknown,
	page: number,
): error is HevyHttpError {
	return isExpectedEndOfList(error, page);
}
