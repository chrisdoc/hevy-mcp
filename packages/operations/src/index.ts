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
	createBodyMeasurementsCreateOperation,
	createBodyMeasurementsGetOperation,
	createBodyMeasurementsListOperation,
	createBodyMeasurementsUpdateOperation,
	type BodyMeasurementsCreateOperation,
	type BodyMeasurementsGetOperation,
	type BodyMeasurementsListOperation,
	type BodyMeasurementsUpdateOperation,
} from "./body-measurements.js";
import {
	createFoldersCreateOperation,
	createFoldersGetOperation,
	createFoldersListAllOperation,
	type FoldersCreateOperation,
	type FoldersGetOperation,
	type FoldersListAllOperation,
} from "./folders.js";
import {
	createTemplatesCreateOperation,
	createTemplatesGetOperation,
	createTemplatesHistoryOperation,
	createTemplatesListAllOperation,
	type TemplatesCreateOperation,
	type TemplatesGetOperation,
	type TemplatesHistoryOperation,
	type TemplatesListAllOperation,
} from "./templates.js";
import { createUserGetOperation, type UserGetOperation } from "./user.js";
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
	createBodyMeasurementsCreateOperation,
	createBodyMeasurementsGetOperation,
	createBodyMeasurementsListOperation,
	createBodyMeasurementsUpdateOperation,
	bodyMeasurementsCreateDescriptor,
	bodyMeasurementsGetDescriptor,
	bodyMeasurementsListDescriptor,
	bodyMeasurementsUpdateDescriptor,
} from "./body-measurements.js";
export type {
	BodyMeasurementsCreateAdapter,
	BodyMeasurementsCreateDescriptor,
	BodyMeasurementsCreateInput,
	BodyMeasurementsCreateOperation,
	BodyMeasurementsGetAdapter,
	BodyMeasurementsGetDescriptor,
	BodyMeasurementsGetInput,
	BodyMeasurementsGetOperation,
	BodyMeasurementsGetOutput,
	BodyMeasurementsListAdapter,
	BodyMeasurementsListDescriptor,
	BodyMeasurementsListInput,
	BodyMeasurementsListOperation,
	BodyMeasurementsListOutput,
	BodyMeasurementsUpdateAdapter,
	BodyMeasurementsUpdateDescriptor,
	BodyMeasurementsUpdateInput,
	BodyMeasurementsUpdateOperation,
} from "./body-measurements.js";
export {
	createFoldersCreateOperation,
	createFoldersGetOperation,
	createFoldersListAllOperation,
	foldersCreateDescriptor,
	foldersGetDescriptor,
	foldersListAllDescriptor,
} from "./folders.js";
export type {
	FoldersCreateAdapter,
	FoldersCreateDescriptor,
	FoldersCreateInput,
	FoldersCreateOperation,
	FoldersGetAdapter,
	FoldersGetDescriptor,
	FoldersGetInput,
	FoldersGetOperation,
	FoldersGetOutput,
	FoldersListAllAdapter,
	FoldersListAllDescriptor,
	FoldersListAllOperation,
} from "./folders.js";
export {
	createTemplatesCreateOperation,
	createTemplatesGetOperation,
	createTemplatesHistoryOperation,
	createTemplatesListAllOperation,
	templatesCreateDescriptor,
	templatesGetDescriptor,
	templatesHistoryDescriptor,
	templatesListAllDescriptor,
} from "./templates.js";
export type {
	TemplatesCreateAdapter,
	TemplatesCreateDescriptor,
	TemplatesCreateInput,
	TemplatesCreateOperation,
	TemplatesGetAdapter,
	TemplatesGetDescriptor,
	TemplatesGetInput,
	TemplatesGetOperation,
	TemplatesGetOutput,
	TemplatesHistoryAdapter,
	TemplatesHistoryDescriptor,
	TemplatesHistoryInput,
	TemplatesHistoryOperation,
	TemplatesHistoryOutput,
	TemplatesListAllAdapter,
	TemplatesListAllDescriptor,
	TemplatesListAllOperation,
} from "./templates.js";
export { createUserGetOperation, userGetDescriptor } from "./user.js";
export type {
	UserGetAdapter,
	UserGetDescriptor,
	UserGetOperation,
} from "./user.js";
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
		readonly create: BodyMeasurementsCreateOperation;
		readonly get: BodyMeasurementsGetOperation;
		readonly list: BodyMeasurementsListOperation;
		readonly update: BodyMeasurementsUpdateOperation;
	};
	readonly folders?: {
		readonly create?: FoldersCreateOperation;
		readonly get: FoldersGetOperation;
		readonly listAll: FoldersListAllOperation;
	};
	readonly templates?: {
		readonly create?: TemplatesCreateOperation;
		readonly get: TemplatesGetOperation;
		readonly history: TemplatesHistoryOperation;
		readonly listAll: TemplatesListAllOperation;
	};
	readonly user?: {
		readonly get: UserGetOperation;
	};
}

type ExistingRequestEffectClient = Pick<
	HevyRequestEffectClient,
	| "getBodyMeasurements"
	| "getBodyMeasurement"
	| "createBodyMeasurement"
	| "updateBodyMeasurement"
	| "getExerciseTemplate"
	| "getExerciseHistory"
	| "createExerciseTemplate"
	| "getExerciseTemplates"
	| "getRoutineFolder"
	| "createRoutineFolder"
	| "getRoutineFolders"
	| "getUserInfo"
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
		getBodyMeasurement: (...args) =>
			getRequestEffectClientOnce().getBodyMeasurement(...args),
		createBodyMeasurement: (...args) =>
			getRequestEffectClientOnce().createBodyMeasurement(...args),
		updateBodyMeasurement: (...args) =>
			getRequestEffectClientOnce().updateBodyMeasurement(...args),
		getExerciseTemplate: (...args) =>
			getRequestEffectClientOnce().getExerciseTemplate(...args),
		getExerciseHistory: (...args) =>
			getRequestEffectClientOnce().getExerciseHistory(...args),
		createExerciseTemplate: (...args) =>
			getRequestEffectClientOnce().createExerciseTemplate(...args),
		getExerciseTemplates: (...args) =>
			getRequestEffectClientOnce().getExerciseTemplates(...args),
		getRoutineFolder: (...args) =>
			getRequestEffectClientOnce().getRoutineFolder(...args),
		createRoutineFolder: (...args) =>
			getRequestEffectClientOnce().createRoutineFolder(...args),
		getRoutineFolders: (...args) =>
			getRequestEffectClientOnce().getRoutineFolders(...args),
		getUserInfo: (...args) => getRequestEffectClientOnce().getUserInfo(...args),
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
			create: createBodyMeasurementsCreateOperation(lazyRequestEffectClient),
			get: createBodyMeasurementsGetOperation(lazyRequestEffectClient),
			list: createBodyMeasurementsListOperation(lazyRequestEffectClient),
			update: createBodyMeasurementsUpdateOperation(lazyRequestEffectClient),
		},
		folders: {
			create: createFoldersCreateOperation(lazyRequestEffectClient),
			get: createFoldersGetOperation(lazyRequestEffectClient),
			listAll: createFoldersListAllOperation(lazyRequestEffectClient),
		},
		templates: {
			create: createTemplatesCreateOperation(lazyRequestEffectClient),
			get: createTemplatesGetOperation(lazyRequestEffectClient),
			history: createTemplatesHistoryOperation(lazyRequestEffectClient),
			listAll: createTemplatesListAllOperation(lazyRequestEffectClient),
		},
		user: {
			get: createUserGetOperation(lazyRequestEffectClient),
		},
	};
}
