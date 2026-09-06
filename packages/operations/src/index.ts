import type { HevyClient, HevyOperationSafety } from "@hevy-mcp/hevy-client";
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
	createTemplatesSearchOperation,
	type TemplatesCreateOperation,
	type TemplatesGetOperation,
	type TemplatesHistoryOperation,
	type TemplatesListAllOperation,
	type TemplatesSearchOperation,
} from "./templates.js";
import { createUserGetOperation, type UserGetOperation } from "./user.js";
import {
	createWorkflowsTrainingSummaryOperation,
	type WorkflowsTrainingSummaryOperation,
} from "./workflows.js";
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
	createTemplatesSearchOperation,
	templatesCreateDescriptor,
	templatesGetDescriptor,
	templatesHistoryDescriptor,
	templatesListAllDescriptor,
	templatesSearchDescriptor,
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
	TemplatesListAllResult,
	TemplatesSearchDescriptor,
	TemplatesSearchInput,
	TemplatesSearchOperation,
	TemplatesSearchOutput,
} from "./templates.js";
export { createUserGetOperation, userGetDescriptor } from "./user.js";
export type {
	UserGetAdapter,
	UserGetDescriptor,
	UserGetOperation,
} from "./user.js";
export {
	createTrainingSummaryOperation,
	createWorkflowsTrainingSummaryOperation,
	trainingSummaryDescriptor,
	workflowsTrainingSummaryDescriptor,
} from "./workflows.js";
export type {
	TrainingSummaryAdapter,
	TrainingSummaryInput,
	TrainingSummaryMeasurement,
	TrainingSummaryOperation,
	TrainingSummaryOperations,
	TrainingSummaryPage,
	TrainingSummaryPageLoader,
	TrainingSummaryPeriod,
	TrainingSummaryResult,
	TrainingSummaryScanResult,
	TrainingSummarySession,
	TrainingSummaryOperationOptions,
	WorkflowsTrainingSummaryDescriptor,
	WorkflowsTrainingSummaryOperation,
	WorkflowsTrainingSummaryOperations,
} from "./workflows.js";
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
	TrainingSummaryDataError,
	TrainingSummaryValidationError,
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
		readonly search?: TemplatesSearchOperation;
	};
	readonly user?: {
		readonly get: UserGetOperation;
	};
	readonly workflows?: {
		readonly trainingSummary: WorkflowsTrainingSummaryOperation;
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

export interface CreateOperationsOptions {
	readonly trainingSummaryMaxWeeks?: number;
	readonly trainingSummaryStrictPagination?: boolean;
}

export function createOperations(
	client: HevyClient,
	options: CreateOperationsOptions = {},
): HevyOperations {
	const requestEffectClients = new Map<
		HevyOperationSafety,
		HevyRequestEffectClient
	>();
	const getRequestEffectClientOnce = (
		safety: HevyOperationSafety,
	): HevyRequestEffectClient => {
		const existing = requestEffectClients.get(safety);
		if (existing !== undefined) return existing;
		const created = getRequestEffectClient(client, safety);
		requestEffectClients.set(safety, created);
		return created;
	};
	const createLazyRequestEffectClient = (
		safety: HevyOperationSafety,
	): ExistingRequestEffectClient => {
		const get = () => getRequestEffectClientOnce(safety);
		return {
			createWorkout: (...args) => get().createWorkout(...args),
			getBodyMeasurements: (...args) => get().getBodyMeasurements(...args),
			getBodyMeasurement: (...args) => get().getBodyMeasurement(...args),
			createBodyMeasurement: (...args) => get().createBodyMeasurement(...args),
			updateBodyMeasurement: (...args) => get().updateBodyMeasurement(...args),
			getExerciseTemplate: (...args) => get().getExerciseTemplate(...args),
			getExerciseHistory: (...args) => get().getExerciseHistory(...args),
			createExerciseTemplate: (...args) =>
				get().createExerciseTemplate(...args),
			getExerciseTemplates: (...args) => get().getExerciseTemplates(...args),
			getRoutineFolder: (...args) => get().getRoutineFolder(...args),
			createRoutineFolder: (...args) => get().createRoutineFolder(...args),
			getRoutineFolders: (...args) => get().getRoutineFolders(...args),
			getUserInfo: (...args) => get().getUserInfo(...args),
			getWorkoutEvents: (...args) => get().getWorkoutEvents(...args),
			getWorkouts: (...args) => get().getWorkouts(...args),
			getWorkout: (...args) => get().getWorkout(...args),
			getWorkoutCount: (...args) => get().getWorkoutCount(...args),
			getRoutines: (...args) => get().getRoutines(...args),
			getRoutineById: (...args) => get().getRoutineById(...args),
			createRoutine: (...args) => get().createRoutine(...args),
			updateRoutine: (...args) => get().updateRoutine(...args),
			updateWorkout: (...args) => get().updateWorkout(...args),
		};
	};
	const readClient = createLazyRequestEffectClient("read");
	const idempotentWriteClient =
		createLazyRequestEffectClient("idempotent-write");
	const nonIdempotentWriteClient = createLazyRequestEffectClient(
		"non-idempotent-write",
	);
	const workoutsList = createWorkoutsListOperation(readClient);
	const bodyMeasurementsList = createBodyMeasurementsListOperation(readClient);
	return {
		routines: {
			create: createRoutinesCreateOperation(nonIdempotentWriteClient),
			get: createRoutinesGetOperation(readClient),
			list: createRoutinesListOperation(readClient),
			search: createRoutinesSearchOperation(readClient),
			update: createRoutinesUpdateOperation(idempotentWriteClient),
		},
		workouts: {
			count: createWorkoutsCountOperation(readClient),
			create: createWorkoutsCreateOperation(nonIdempotentWriteClient),
			events: createWorkoutsEventsOperation(readClient),
			get: createWorkoutsGetOperation(readClient),
			list: workoutsList,
			replaceExercises: createWorkoutsReplaceExercisesOperation(
				idempotentWriteClient,
			),
			update: createWorkoutsUpdateOperation(idempotentWriteClient),
		},
		bodyMeasurements: {
			create: createBodyMeasurementsCreateOperation(nonIdempotentWriteClient),
			get: createBodyMeasurementsGetOperation(readClient),
			list: bodyMeasurementsList,
			update: createBodyMeasurementsUpdateOperation(idempotentWriteClient),
		},
		folders: {
			create: createFoldersCreateOperation(nonIdempotentWriteClient),
			get: createFoldersGetOperation(readClient),
			listAll: createFoldersListAllOperation(readClient),
		},
		templates: {
			create: createTemplatesCreateOperation(nonIdempotentWriteClient),
			get: createTemplatesGetOperation(readClient),
			history: createTemplatesHistoryOperation(readClient),
			listAll: createTemplatesListAllOperation(readClient),
			search: createTemplatesSearchOperation(readClient),
		},
		user: {
			get: createUserGetOperation(readClient),
		},
		workflows: {
			trainingSummary: createWorkflowsTrainingSummaryOperation(
				{
					workouts: {
						list: workoutsList,
					},
					bodyMeasurements: {
						list: bodyMeasurementsList,
					},
				},
				{
					maxWeeks: options.trainingSummaryMaxWeeks,
					strictPagination: options.trainingSummaryStrictPagination,
				},
			),
		},
	};
}
