import { Effect } from "effect";
import type {
	HevyExecutionOptions,
	HevyOperationSafety,
} from "@hevy-mcp/hevy-client";
import type {
	HevyRequestEffectClient,
	HevyRequestEffectError,
} from "@hevy-mcp/hevy-client/internal";
import type { GetV1Workouts200, Workout } from "@hevy-mcp/hevy-client/types";
import {
	isExpectedReadEndOfList,
	isExpectedReadNotFound,
	PaginationMismatchError,
} from "./operation-errors.js";

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

export type WorkoutsListAdapter = Pick<HevyRequestEffectClient, "getWorkouts">;

export interface WorkoutsGetInput {
	readonly workoutId: string;
}

export interface WorkoutsGetOutput {
	readonly workout: Workout | null;
	readonly expected404Outcome?: "not_found";
}

export type WorkoutsGetAdapter = Pick<HevyRequestEffectClient, "getWorkout">;

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
	readonly effect: (
		input: WorkoutsGetInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<WorkoutsGetOutput, HevyRequestEffectError>;
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
	readonly effect: (
		input: WorkoutsListInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<
		WorkoutsListOutput,
		HevyRequestEffectError | PaginationMismatchError
	>;
	execute(
		input: WorkoutsListInput,
		options?: HevyExecutionOptions,
	): Promise<WorkoutsListOutput>;
}

export function createWorkoutsGetOperation(
	adapter: WorkoutsGetAdapter,
): WorkoutsGetOperation {
	const effect = Effect.fn("operations.workouts.get")(function* (
		input: WorkoutsGetInput,
		options?: HevyExecutionOptions,
	) {
		const request =
			options === undefined
				? adapter.getWorkout(input.workoutId)
				: adapter.getWorkout(input.workoutId, options);
		return yield* request.pipe(
			Effect.map((response) => ({ workout: response ?? null })),
			Effect.catchIf(
				(error) => isExpectedReadNotFound(error, "/v1/workouts"),
				() =>
					Effect.succeed({
						workout: null,
						expected404Outcome: "not_found" as const,
					}),
			),
		);
	});

	const operation: WorkoutsGetOperation = {
		descriptor: workoutsGetDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

export function createWorkoutsListOperation(
	adapter: WorkoutsListAdapter,
): WorkoutsListOperation {
	const effect = Effect.fn("operations.workouts.list")(function* (
		input: WorkoutsListInput,
		options?: HevyExecutionOptions,
	) {
		const params = { page: input.page, pageSize: input.pageSize };
		const request =
			options === undefined
				? adapter.getWorkouts(params)
				: adapter.getWorkouts(params, options);
		return yield* request.pipe(
			Effect.flatMap((response: GetV1Workouts200) => {
				if (response.page !== undefined && response.page !== input.page) {
					return Effect.fail(
						new PaginationMismatchError({
							requested: input.page,
							received: response.page,
							collection: "workouts",
							message: `Workouts page mismatch: requested page ${input.page} but received page ${response.page}`,
						}),
					);
				}
				return Effect.succeed({
					items: response.workouts ?? [],
					page: response.page ?? input.page,
					pageCount: response.page_count,
				});
			}),
			Effect.catchIf(
				(error) => isExpectedReadEndOfList(error, "/v1/workouts", input.page),
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

	const operation: WorkoutsListOperation = {
		descriptor: workoutsListDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}
