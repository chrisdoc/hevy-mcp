import type {
	HevyClient,
	HevyExecutionOptions,
	HevyHttpError,
	HevyOperationSafety,
} from "@hevy-mcp/hevy-client";
import type { GetV1Workouts200, Workout } from "@hevy-mcp/hevy-client/types";
import {
	canonicalEndpointIdentity,
	expectedGet404Outcome,
	isHevyHttpError,
} from "@hevy-mcp/hevy-client";

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

export interface WorkoutsGetInput {
	readonly workoutId: string;
}

export interface WorkoutsGetOutput {
	readonly workout: Workout | null;
	readonly expected404Outcome?: "not_found";
}

export type WorkoutsGetAdapter = Pick<HevyClient, "getWorkout">;

export interface WorkoutsGetDescriptor {
	readonly id: "workouts.get";
	readonly safety: Extract<HevyOperationSafety, "read">;
}

export const workoutsGetDescriptor: WorkoutsGetDescriptor = {
	id: "workouts.get",
	safety: "read",
};

export interface WorkoutsGetOperation {
	readonly descriptor: WorkoutsGetDescriptor;
	execute(
		input: WorkoutsGetInput,
		options?: HevyExecutionOptions,
	): Promise<WorkoutsGetOutput>;
}

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

function isExpectedWorkoutNotFound(error: unknown): boolean {
	return (
		isHevyHttpError(error) &&
		canonicalEndpointIdentity(error.endpoint) === "/v1/workouts/:workoutId" &&
		expectedGet404Outcome(error.endpoint, error.method, error.status) ===
			"not_found"
	);
}

export function isWorkoutsGetNotFound(error: unknown): error is HevyHttpError {
	return isExpectedWorkoutNotFound(error);
}

function isExpectedEndOfList(error: unknown, page: number): boolean {
	return (
		page > 1 &&
		isHevyHttpError(error) &&
		canonicalEndpointIdentity(error.endpoint) === "/v1/workouts" &&
		expectedGet404Outcome(error.endpoint, error.method, error.status, page) ===
			"end_of_list"
	);
}

function normalizeWorkoutsPage(
	response: GetV1Workouts200,
	input: WorkoutsListInput,
): WorkoutsListOutput {
	if (response.page !== undefined && response.page !== input.page) {
		throw new Error(
			`Workouts page mismatch: requested page ${input.page} but received page ${response.page}`,
		);
	}
	return {
		items: response.workouts ?? [],
		page: response.page ?? input.page,
		pageCount: response.page_count,
	};
}

export function createWorkoutsGetOperation(
	adapter: WorkoutsGetAdapter,
): WorkoutsGetOperation {
	return {
		descriptor: workoutsGetDescriptor,
		async execute(input, options) {
			try {
				const response =
					options === undefined
						? await adapter.getWorkout(input.workoutId)
						: await adapter.getWorkout(input.workoutId, options);
				return { workout: response ?? null };
			} catch (error) {
				if (isWorkoutsGetNotFound(error)) {
					return {
						workout: null,
						expected404Outcome: "not_found",
					};
				}
				throw error;
			}
		},
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
