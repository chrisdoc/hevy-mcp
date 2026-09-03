import type { HevyClient } from "@hevy-mcp/hevy-client";
import {
	getRequestEffectClient,
	type HevyRequestEffectClient,
} from "@hevy-mcp/hevy-client/internal";
import {
	createRoutinesCreateOperation,
	createRoutinesGetOperation,
	createRoutinesListOperation,
	createRoutinesSearchOperation,
	createRoutinesUpdateOperation,
	type RoutinesCreateOperation,
	type RoutinesGetOperation,
	type RoutinesListOperation,
	type RoutinesSearchOperation,
	type RoutinesUpdateOperation,
} from "./routines.js";
import {
	createBodyMeasurementsListOperation,
	type BodyMeasurementsListOperation,
} from "./body-measurements.js";
import {
	createWorkoutsCountOperation,
	createWorkoutsCreateOperation,
	createWorkoutsEventsOperation,
	createWorkoutsGetOperation,
	createWorkoutsListOperation,
	createWorkoutsReplaceExercisesOperation,
	createWorkoutsUpdateOperation,
	type WorkoutsCountOperation,
	type WorkoutsCreateOperation,
	type WorkoutsEventsOperation,
	type WorkoutsGetOperation,
	type WorkoutsListOperation,
	type WorkoutsReplaceExercisesOperation,
	type WorkoutsUpdateOperation,
} from "./workouts.js";

export {
	createRoutinesCreateOperation,
	createRoutinesGetOperation,
	createRoutinesListOperation,
	createRoutinesSearchOperation,
	createRoutinesUpdateOperation,
	routinesCreateDescriptor,
	routinesGetDescriptor,
	routinesListDescriptor,
	routinesSearchDescriptor,
	routinesUpdateDescriptor,
} from "./routines.js";
export type {
	RoutinesCreateAdapter,
	RoutinesCreateDescriptor,
	RoutinesCreateInput,
	RoutinesCreateOperation,
	RoutinesCreateOutput,
	RoutinesGetAdapter,
	RoutinesGetDescriptor,
	RoutinesGetInput,
	RoutinesGetOperation,
	RoutinesGetOutput,
	RoutinesListAdapter,
	RoutinesListDescriptor,
	RoutinesListInput,
	RoutinesListOperation,
	RoutinesListOutput,
	RoutinesSearchAdapter,
	RoutinesSearchDescriptor,
	RoutinesSearchInput,
	RoutinesSearchOperation,
	RoutinesSearchOutput,
	RoutinesUpdateAdapter,
	RoutinesUpdateDescriptor,
	RoutinesUpdateInput,
	RoutinesUpdateOperation,
	RoutinesUpdateOutput,
} from "./routines.js";
export {
	createBodyMeasurementsListOperation,
	bodyMeasurementsListDescriptor,
} from "./body-measurements.js";
export type {
	BodyMeasurementsListAdapter,
	BodyMeasurementsListDescriptor,
	BodyMeasurementsListInput,
	BodyMeasurementsListOperation,
	BodyMeasurementsListOutput,
} from "./body-measurements.js";
export {
	createWorkoutsCountOperation,
	createWorkoutsCreateOperation,
	createWorkoutsEventsOperation,
	createWorkoutsGetOperation,
	createWorkoutsListOperation,
	createWorkoutsReplaceExercisesOperation,
	createWorkoutsUpdateOperation,
	workoutsCountDescriptor,
	workoutsCreateDescriptor,
	workoutsEventsDescriptor,
	workoutsGetDescriptor,
	workoutsListDescriptor,
	workoutsReplaceExercisesDescriptor,
	workoutsUpdateDescriptor,
} from "./workouts.js";
export type {
	WorkoutsCountAdapter,
	WorkoutsCountDescriptor,
	WorkoutsCountOperation,
	WorkoutsCreateAdapter,
	WorkoutsCreateDescriptor,
	WorkoutsCreateInput,
	WorkoutsCreateOperation,
	WorkoutsEventsAdapter,
	WorkoutsEventsDescriptor,
	WorkoutsEventsInput,
	WorkoutsEventsOperation,
	WorkoutsEventsOutput,
	WorkoutsGetAdapter,
	WorkoutsGetDescriptor,
	WorkoutsGetInput,
	WorkoutsGetOperation,
	WorkoutsGetOutput,
	WorkoutsListAdapter,
	WorkoutsListDescriptor,
	WorkoutsListInput,
	WorkoutsListOperation,
	WorkoutsListOutput,
	WorkoutsReplaceExercisesAdapter,
	WorkoutsReplaceExercisesDescriptor,
	WorkoutsReplaceExercisesInput,
	WorkoutsReplaceExercisesOperation,
	WorkoutsUpdateAdapter,
	WorkoutsUpdateDescriptor,
	WorkoutsUpdateInput,
	WorkoutsUpdateOperation,
} from "./workouts.js";
export { PaginationMismatchError } from "./operation-errors.js";
export {
	EmptyMeasurementUpdateError,
	WorkoutPayloadError,
	WorkoutPrivacyError,
} from "./operation-errors.js";
export type {
	ExpectedReadError,
	ReadCollectionEndpoint,
	ReadEndpoint,
	ReadMemberEndpoint,
	ReadOperationError,
} from "./operation-errors.js";
export { WORKOUT_PUT_REQUIRES_IS_PRIVATE } from "./hevy-quirks.js";
export {
	buildMeasurementPayload,
	buildRoutinePayload,
	buildWorkoutUpdatePayload,
	measurementKeys,
	mergeMeasurementPayload,
} from "./mutation-semantics.js";
export type {
	MeasurementFields,
	MeasurementKey,
	MeasurementMergeResult,
	MeasurementPayload,
	RoutineCreatePayload,
	RoutineExerciseInput,
	RoutinePayloadInput,
	RoutinePayloadResult,
	RoutineRepRangeInput,
	RoutineSetInput,
	RoutineUpdatePayload,
	WorkoutExerciseInput,
	WorkoutMetadataPatchInput,
	WorkoutSetInput,
	WorkoutUpdatePayload,
} from "./mutation-semantics.js";

export interface HevyOperations {
	readonly routines: {
		readonly create?: RoutinesCreateOperation;
		readonly get: RoutinesGetOperation;
		readonly list: RoutinesListOperation;
		readonly search?: RoutinesSearchOperation;
		readonly update?: RoutinesUpdateOperation;
	};
	readonly workouts: {
		readonly count?: WorkoutsCountOperation;
		readonly create?: WorkoutsCreateOperation;
		readonly events?: WorkoutsEventsOperation;
		readonly get: WorkoutsGetOperation;
		readonly list: WorkoutsListOperation;
		readonly replaceExercises?: WorkoutsReplaceExercisesOperation;
		readonly update?: WorkoutsUpdateOperation;
	};
	readonly bodyMeasurements?: {
		readonly list: BodyMeasurementsListOperation;
	};
}

type ExistingRequestEffectClient = Pick<
	HevyRequestEffectClient,
	| "getBodyMeasurements"
	| "createWorkout"
	| "getWorkoutCount"
	| "updateWorkout"
	| "getWorkoutEvents"
	| "getWorkouts"
	| "getWorkout"
	| "getRoutines"
	| "getRoutineById"
	| "createRoutine"
	| "updateRoutine"
>;

export function createOperations(client: HevyClient): HevyOperations {
	let requestEffectClient: HevyRequestEffectClient | undefined;
	const getRequestEffectClientOnce = (): HevyRequestEffectClient => {
		requestEffectClient ??= getRequestEffectClient(client);
		return requestEffectClient;
	};
	const lazyRequestEffectClient: ExistingRequestEffectClient = {
		createWorkout: (...args) =>
			getRequestEffectClientOnce().createWorkout(...args),
		getBodyMeasurements: (...args) =>
			getRequestEffectClientOnce().getBodyMeasurements(...args),
		getWorkoutEvents: (...args) =>
			getRequestEffectClientOnce().getWorkoutEvents(...args),
		getWorkouts: (...args) => getRequestEffectClientOnce().getWorkouts(...args),
		getWorkout: (...args) => getRequestEffectClientOnce().getWorkout(...args),
		getWorkoutCount: (...args) =>
			getRequestEffectClientOnce().getWorkoutCount(...args),
		getRoutines: (...args) => getRequestEffectClientOnce().getRoutines(...args),
		getRoutineById: (...args) =>
			getRequestEffectClientOnce().getRoutineById(...args),
		createRoutine: (...args) =>
			getRequestEffectClientOnce().createRoutine(...args),
		updateRoutine: (...args) =>
			getRequestEffectClientOnce().updateRoutine(...args),
		updateWorkout: (...args) =>
			getRequestEffectClientOnce().updateWorkout(...args),
	};
	return {
		routines: {
			create: createRoutinesCreateOperation(lazyRequestEffectClient),
			get: createRoutinesGetOperation(lazyRequestEffectClient),
			list: createRoutinesListOperation(lazyRequestEffectClient),
			search: createRoutinesSearchOperation(lazyRequestEffectClient),
			update: createRoutinesUpdateOperation(lazyRequestEffectClient),
		},
		workouts: {
			count: createWorkoutsCountOperation(lazyRequestEffectClient),
			create: createWorkoutsCreateOperation(lazyRequestEffectClient),
			events: createWorkoutsEventsOperation(lazyRequestEffectClient),
			get: createWorkoutsGetOperation(lazyRequestEffectClient),
			list: createWorkoutsListOperation(lazyRequestEffectClient),
			replaceExercises: createWorkoutsReplaceExercisesOperation(
				lazyRequestEffectClient,
			),
			update: createWorkoutsUpdateOperation(lazyRequestEffectClient),
		},
		bodyMeasurements: {
			list: createBodyMeasurementsListOperation(lazyRequestEffectClient),
		},
	};
}
