import { Effect } from "effect";
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
	assertPageEcho,
	isEmptyResponse,
	withExpectedEndOfList,
	withExpectedNotFound,
	PaginationMismatchError,
	WorkoutPayloadError,
	WorkoutPrivacyError,
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
	) => Effect.Effect<PostV1Workouts201 | undefined, HevyRequestEffectError>;
	execute(
		input: WorkoutsCreateInput,
		options?: HevyExecutionOptions,
	): Promise<PostV1Workouts201 | undefined>;
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

type WorkoutReplacementPatch = WorkoutMetadataPatchInput & {
	readonly exercises: WorkoutExerciseInput[];
};

function isWorkoutReplacementPatch(
	patch: WorkoutMetadataPatchInput | WorkoutReplacementPatch,
): patch is WorkoutReplacementPatch {
	return "exercises" in patch;
}

export type WorkoutsUpdateInput =
	| {
			readonly workoutId: string;
			readonly patch: WorkoutMetadataPatchInput;
	  }
	| {
			readonly workoutId: string;
			readonly workout: WorkoutMetadataPatchInput | WorkoutReplacementPatch;
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
		PutV1WorkoutsWorkoutid200 | undefined,
		HevyRequestEffectError | WorkoutPrivacyError | WorkoutPayloadError
	>;
	execute(
		input: WorkoutsUpdateInput,
		options?: HevyExecutionOptions,
	): Promise<PutV1WorkoutsWorkoutid200 | undefined>;
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
		PutV1WorkoutsWorkoutid200 | undefined,
		HevyRequestEffectError | WorkoutPrivacyError | WorkoutPayloadError
	>;
	execute(
		input: WorkoutsReplaceExercisesInput,
		options?: HevyExecutionOptions,
	): Promise<PutV1WorkoutsWorkoutid200 | undefined>;
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
	// Only the builder's documented validation tags stay in the failure
	// channel. Anything else (e.g. a TypeError from a programming bug) is a
	// defect and must stay loud instead of being mislabeled a payload error.
	return Effect.suspend(() => {
		try {
			return Effect.succeed(
				buildWorkoutUpdatePayload(current, patch, replacementExercises),
			);
		} catch (cause) {
			if (
				cause instanceof WorkoutPrivacyError ||
				cause instanceof WorkoutPayloadError
			) {
				return Effect.fail(cause);
			}
			return Effect.die(cause);
		}
	});
}

export function createWorkoutsCreateOperation(
	adapter: WorkoutsCreateAdapter,
): WorkoutsCreateOperation {
	return defineOperation(
		workoutsCreateDescriptor,
		function* (input: WorkoutsCreateInput, options?: HevyExecutionOptions) {
			const request = adapter.createWorkout(
				{ workout: input.workout },
				options,
			);
			const response = yield* request;
			return isEmptyResponse(response) ? undefined : response;
		},
	);
}

export function createWorkoutsEventsOperation(
	adapter: WorkoutsEventsAdapter,
): WorkoutsEventsOperation {
	return defineOperation(
		workoutsEventsDescriptor,
		function* (input: WorkoutsEventsInput, options?: HevyExecutionOptions) {
			const params =
				input.since === undefined
					? { page: input.page, pageSize: input.pageSize }
					: {
							page: input.page,
							pageSize: input.pageSize,
							since: input.since,
						};
			const request = adapter.getWorkoutEvents(params, options);
			return yield* request.pipe(
				Effect.tap((response) =>
					assertPageEcho(response, input.page, "workoutEvents"),
				),
				Effect.map((response: GetV1WorkoutsEvents200) => ({
					events: response?.events ?? [],
					page: response?.page ?? input.page,
					pageCount: response?.page_count,
					since: input.since,
				})),
				withExpectedEndOfList("/v1/workouts/events", input.page, {
					events: [],
					page: input.page,
					pageCount: undefined,
					since: input.since,
					expected404Outcome: "end_of_list" as const,
				}),
			);
		},
	);
}

export function createWorkoutsUpdateOperation(
	adapter: WorkoutsUpdateAdapter,
): WorkoutsUpdateOperation {
	return defineOperation(
		workoutsUpdateDescriptor,
		function* (input: WorkoutsUpdateInput, options?: HevyExecutionOptions) {
			const patch = "patch" in input ? input.patch : input.workout;
			const replacementExercises = isWorkoutReplacementPatch(patch)
				? patch.exercises
				: undefined;
			const current = yield* adapter.getWorkout(input.workoutId, options);
			const payload = yield* workoutPayloadEffect(
				current,
				patch,
				replacementExercises,
			);
			const updateRequest = adapter.updateWorkout(
				input.workoutId,
				{ workout: payload },
				options,
			);
			const response = yield* updateRequest;
			return isEmptyResponse(response) ? undefined : response;
		},
	);
}

export function createWorkoutsReplaceExercisesOperation(
	adapter: WorkoutsReplaceExercisesAdapter,
): WorkoutsReplaceExercisesOperation {
	return defineOperation(
		workoutsReplaceExercisesDescriptor,
		function* (
			input: WorkoutsReplaceExercisesInput,
			options?: HevyExecutionOptions,
		) {
			const getRequest = adapter.getWorkout(input.workoutId, options);
			const current = yield* getRequest;
			const payload = yield* workoutPayloadEffect(
				current,
				{ is_private: input.is_private },
				input.exercises,
			);
			const updateRequest = adapter.updateWorkout(
				input.workoutId,
				{ workout: payload },
				options,
			);
			const response = yield* updateRequest;
			return isEmptyResponse(response) ? undefined : response;
		},
	);
}

export function createWorkoutsCountOperation(
	adapter: WorkoutsCountAdapter,
): WorkoutsCountOperation {
	return defineOperation(
		workoutsCountDescriptor,
		function* (options?: HevyExecutionOptions) {
			const request = adapter.getWorkoutCount(options);
			const response = yield* request;
			return response?.workout_count ?? 0;
		},
	);
}

export function createWorkoutsGetOperation(
	adapter: WorkoutsGetAdapter,
): WorkoutsGetOperation {
	return defineOperation(
		workoutsGetDescriptor,
		function* (input: WorkoutsGetInput, options?: HevyExecutionOptions) {
			const request = adapter.getWorkout(input.workoutId, options);
			return yield* request.pipe(
				Effect.map((response) => ({
					workout: isEmptyResponse(response) ? null : (response ?? null),
				})),
				withExpectedNotFound("/v1/workouts", {
					workout: null,
					expected404Outcome: "not_found" as const,
				}),
			);
		},
	);
}

export function createWorkoutsListOperation(
	adapter: WorkoutsListAdapter,
): WorkoutsListOperation {
	return defineOperation(
		workoutsListDescriptor,
		function* (input: WorkoutsListInput, options?: HevyExecutionOptions) {
			const params = { page: input.page, pageSize: input.pageSize };
			const request = adapter.getWorkouts(params, options);
			return yield* request.pipe(
				Effect.tap((response) =>
					assertPageEcho(response, input.page, "workouts"),
				),
				Effect.map((response: GetV1Workouts200) => ({
					items: response?.workouts ?? [],
					page: response?.page ?? input.page,
					pageCount: response?.page_count,
				})),
				withExpectedEndOfList("/v1/workouts", input.page, {
					items: [],
					page: input.page,
					pageCount: undefined,
					expected404Outcome: "end_of_list" as const,
				}),
			);
		},
	);
}
