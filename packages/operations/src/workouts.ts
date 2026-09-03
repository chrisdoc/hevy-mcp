import { Effect } from "effect";
import type {
	HevyExecutionOptions,
	HevyOperationSafety,
} from "@hevy-mcp/hevy-client";
import type {
	HevyRequestEffectClient,
	HevyRequestEffectError,
} from "@hevy-mcp/hevy-client/internal";
import type {
	GetV1Workouts200,
	GetV1WorkoutsEvents200,
	PostV1Workouts201,
	PostWorkoutsRequestBody,
	PutV1WorkoutsWorkoutid200,
	Workout,
} from "@hevy-mcp/hevy-client/types";
import {
	buildWorkoutUpdatePayload,
	type WorkoutMetadataPatchInput,
	type WorkoutExerciseInput,
} from "./mutation-semantics.js";
import {
	isExpectedReadEndOfList,
	isExpectedReadNotFound,
	WorkoutPayloadError,
	WorkoutPrivacyError,
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

export interface WorkoutsEventsInput {
	readonly page: number;
	readonly pageSize: number;
	readonly since?: string;
}

export interface WorkoutsEventsOutput {
	readonly events: GetV1WorkoutsEvents200["events"];
	readonly page: number;
	readonly pageCount?: number;
	readonly since?: string;
	readonly expected404Outcome?: "end_of_list";
}

export type WorkoutsEventsAdapter = Pick<
	HevyRequestEffectClient,
	"getWorkoutEvents"
>;

export interface WorkoutsEventsDescriptor {
	readonly id: "workouts.events";
	readonly safety: Extract<HevyOperationSafety, "read">;
}

export const workoutsEventsDescriptor: WorkoutsEventsDescriptor = {
	id: "workouts.events",
	safety: "read",
};

export interface WorkoutsEventsOperation {
	readonly descriptor: WorkoutsEventsDescriptor;
	readonly effect: (
		input: WorkoutsEventsInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<
		WorkoutsEventsOutput,
		HevyRequestEffectError | PaginationMismatchError
	>;
	execute(
		input: WorkoutsEventsInput,
		options?: HevyExecutionOptions,
	): Promise<WorkoutsEventsOutput>;
}

export type WorkoutsCreateInput = {
	readonly workout: NonNullable<PostWorkoutsRequestBody["workout"]>;
};

export type WorkoutsCreateAdapter = Pick<
	HevyRequestEffectClient,
	"createWorkout"
>;

export interface WorkoutsCreateDescriptor {
	readonly id: "workouts.create";
	readonly safety: Extract<HevyOperationSafety, "non-idempotent-write">;
}

export const workoutsCreateDescriptor: WorkoutsCreateDescriptor = {
	id: "workouts.create",
	safety: "non-idempotent-write",
};

export interface WorkoutsCreateOperation {
	readonly descriptor: WorkoutsCreateDescriptor;
	readonly effect: (
		input: WorkoutsCreateInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<PostV1Workouts201, HevyRequestEffectError>;
	execute(
		input: WorkoutsCreateInput,
		options?: HevyExecutionOptions,
	): Promise<PostV1Workouts201>;
}

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

export type WorkoutsUpdateInput =
	| {
			readonly workoutId: string;
			readonly patch: WorkoutMetadataPatchInput;
	  }
	| {
			readonly workoutId: string;
			readonly workout: WorkoutMetadataPatchInput;
	  };

export type WorkoutsUpdateAdapter = Pick<
	HevyRequestEffectClient,
	"getWorkout" | "updateWorkout"
>;

export interface WorkoutsUpdateDescriptor {
	readonly id: "workouts.update";
	readonly safety: Extract<HevyOperationSafety, "idempotent-write">;
}

export const workoutsUpdateDescriptor: WorkoutsUpdateDescriptor = {
	id: "workouts.update",
	safety: "idempotent-write",
};

export interface WorkoutsUpdateOperation {
	readonly descriptor: WorkoutsUpdateDescriptor;
	readonly effect: (
		input: WorkoutsUpdateInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<
		PutV1WorkoutsWorkoutid200,
		HevyRequestEffectError | WorkoutPrivacyError | WorkoutPayloadError
	>;
	execute(
		input: WorkoutsUpdateInput,
		options?: HevyExecutionOptions,
	): Promise<PutV1WorkoutsWorkoutid200>;
}

export type WorkoutsReplaceExercisesInput = {
	readonly workoutId: string;
	readonly is_private: boolean;
	readonly exercises: WorkoutExerciseInput[];
};

export type WorkoutsReplaceExercisesAdapter = WorkoutsUpdateAdapter;

export interface WorkoutsReplaceExercisesDescriptor {
	readonly id: "workouts.replaceExercises";
	readonly safety: Extract<HevyOperationSafety, "idempotent-write">;
}

export const workoutsReplaceExercisesDescriptor: WorkoutsReplaceExercisesDescriptor =
	{
		id: "workouts.replaceExercises",
		safety: "idempotent-write",
	};

export interface WorkoutsReplaceExercisesOperation {
	readonly descriptor: WorkoutsReplaceExercisesDescriptor;
	readonly effect: (
		input: WorkoutsReplaceExercisesInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<
		PutV1WorkoutsWorkoutid200,
		HevyRequestEffectError | WorkoutPrivacyError | WorkoutPayloadError
	>;
	execute(
		input: WorkoutsReplaceExercisesInput,
		options?: HevyExecutionOptions,
	): Promise<PutV1WorkoutsWorkoutid200>;
}

export type WorkoutsCountAdapter = Pick<
	HevyRequestEffectClient,
	"getWorkoutCount"
>;

export interface WorkoutsCountDescriptor {
	readonly id: "workouts.count";
	readonly safety: Extract<HevyOperationSafety, "read">;
}

export const workoutsCountDescriptor: WorkoutsCountDescriptor = {
	id: "workouts.count",
	safety: "read",
};

export interface WorkoutsCountOperation {
	readonly descriptor: WorkoutsCountDescriptor;
	readonly effect: (
		options?: HevyExecutionOptions,
	) => Effect.Effect<number, HevyRequestEffectError>;
	execute(options?: HevyExecutionOptions): Promise<number>;
}

function workoutPayloadEffect(
	current: Workout,
	patch: WorkoutMetadataPatchInput,
	replacementExercises?: WorkoutExerciseInput[],
): Effect.Effect<
	ReturnType<typeof buildWorkoutUpdatePayload>,
	WorkoutPrivacyError | WorkoutPayloadError
> {
	return Effect.try({
		try: () => buildWorkoutUpdatePayload(current, patch, replacementExercises),
		catch: (error) => {
			if (
				error instanceof WorkoutPrivacyError ||
				error instanceof WorkoutPayloadError
			) {
				return error;
			}
			return new WorkoutPayloadError({
				message: "The workout metadata is invalid for an update",
			});
		},
	});
}

export function createWorkoutsCreateOperation(
	adapter: WorkoutsCreateAdapter,
): WorkoutsCreateOperation {
	const effect = Effect.fn("operations.workouts.create")(function* (
		input: WorkoutsCreateInput,
		options?: HevyExecutionOptions,
	) {
		const request =
			options === undefined
				? adapter.createWorkout({ workout: input.workout })
				: adapter.createWorkout({ workout: input.workout }, options);
		return yield* request;
	});

	const operation: WorkoutsCreateOperation = {
		descriptor: workoutsCreateDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

export function createWorkoutsEventsOperation(
	adapter: WorkoutsEventsAdapter,
): WorkoutsEventsOperation {
	const effect = Effect.fn("operations.workouts.events")(function* (
		input: WorkoutsEventsInput,
		options?: HevyExecutionOptions,
	) {
		const params =
			input.since === undefined
				? { page: input.page, pageSize: input.pageSize }
				: {
						page: input.page,
						pageSize: input.pageSize,
						since: input.since,
					};
		const request =
			options === undefined
				? adapter.getWorkoutEvents(params)
				: adapter.getWorkoutEvents(params, options);
		return yield* request.pipe(
			Effect.flatMap((response: GetV1WorkoutsEvents200) => {
				if (response?.page !== undefined && response.page !== input.page) {
					return Effect.fail(
						new PaginationMismatchError({
							requested: input.page,
							received: response.page,
							collection: "workoutEvents",
							message: `Workout events page mismatch: requested page ${input.page} but received page ${response.page}`,
						}),
					);
				}
				return Effect.succeed({
					events: response?.events ?? [],
					page: response?.page ?? input.page,
					pageCount: response?.page_count,
					since: input.since,
				});
			}),
			Effect.catchIf(
				(error) =>
					isExpectedReadEndOfList(error, "/v1/workouts/events", input.page),
				() =>
					Effect.succeed({
						events: [],
						page: input.page,
						pageCount: undefined,
						since: input.since,
						expected404Outcome: "end_of_list" as const,
					}),
			),
		);
	});

	const operation: WorkoutsEventsOperation = {
		descriptor: workoutsEventsDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

export function createWorkoutsUpdateOperation(
	adapter: WorkoutsUpdateAdapter,
): WorkoutsUpdateOperation {
	const effect = Effect.fn("operations.workouts.update")(function* (
		input: WorkoutsUpdateInput,
		options?: HevyExecutionOptions,
	) {
		const getRequest =
			options === undefined
				? adapter.getWorkout(input.workoutId)
				: adapter.getWorkout(input.workoutId, options);
		const current = yield* getRequest;
		const patch = "patch" in input ? input.patch : input.workout;
		const payload = yield* workoutPayloadEffect(current, patch);
		const updateRequest =
			options === undefined
				? adapter.updateWorkout(input.workoutId, { workout: payload })
				: adapter.updateWorkout(input.workoutId, { workout: payload }, options);
		return yield* updateRequest;
	});

	const operation: WorkoutsUpdateOperation = {
		descriptor: workoutsUpdateDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

export function createWorkoutsReplaceExercisesOperation(
	adapter: WorkoutsReplaceExercisesAdapter,
): WorkoutsReplaceExercisesOperation {
	const effect = Effect.fn("operations.workouts.replaceExercises")(function* (
		input: WorkoutsReplaceExercisesInput,
		options?: HevyExecutionOptions,
	) {
		const getRequest =
			options === undefined
				? adapter.getWorkout(input.workoutId)
				: adapter.getWorkout(input.workoutId, options);
		const current = yield* getRequest;
		const payload = yield* workoutPayloadEffect(
			current,
			{ is_private: input.is_private },
			input.exercises,
		);
		const updateRequest =
			options === undefined
				? adapter.updateWorkout(input.workoutId, { workout: payload })
				: adapter.updateWorkout(input.workoutId, { workout: payload }, options);
		return yield* updateRequest;
	});

	const operation: WorkoutsReplaceExercisesOperation = {
		descriptor: workoutsReplaceExercisesDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

export function createWorkoutsCountOperation(
	adapter: WorkoutsCountAdapter,
): WorkoutsCountOperation {
	const effect = Effect.fn("operations.workouts.count")(function* (
		options?: HevyExecutionOptions,
	) {
		const request =
			options === undefined
				? adapter.getWorkoutCount()
				: adapter.getWorkoutCount(options);
		const response = yield* request;
		return response?.workout_count ?? 0;
	});

	const operation: WorkoutsCountOperation = {
		descriptor: workoutsCountDescriptor,
		effect,
		execute(options) {
			return Effect.runPromise(operation.effect(options));
		},
	};
	return operation;
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
				if (response?.page !== undefined && response.page !== input.page) {
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
					items: response?.workouts ?? [],
					page: response?.page ?? input.page,
					pageCount: response?.page_count,
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
