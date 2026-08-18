import type {
	GetV1BodyMeasurementsQueryParams,
	GetV1BodyMeasurementsQueryResponse,
	GetV1BodyMeasurementsDateQueryResponse,
	GetV1ExerciseHistoryExercisetemplateidQueryParams,
	GetV1ExerciseHistoryExercisetemplateidQueryResponse,
	GetV1ExerciseTemplatesQueryParams,
	GetV1ExerciseTemplatesQueryResponse,
	GetV1ExerciseTemplatesExercisetemplateidQueryResponse,
	GetV1RoutineFoldersQueryParams,
	GetV1RoutineFoldersQueryResponse,
	GetV1RoutineFoldersFolderidQueryResponse,
	GetV1RoutinesQueryParams,
	GetV1RoutinesQueryResponse,
	GetV1RoutinesRoutineidQueryResponse,
	GetV1UserInfoQueryResponse,
	GetV1WorkoutsEventsQueryParams,
	GetV1WorkoutsEventsQueryResponse,
	GetV1WorkoutsQueryParams,
	GetV1WorkoutsQueryResponse,
	GetV1WorkoutsCountQueryResponse,
	GetV1WorkoutsWorkoutidQueryResponse,
	PostV1BodyMeasurementsMutationRequest,
	PostV1BodyMeasurementsMutationResponse,
	PostV1ExerciseTemplatesMutationRequest,
	PostV1ExerciseTemplatesMutationResponse,
	PostV1RoutineFoldersMutationRequest,
	PostV1RoutineFoldersMutationResponse,
	PostV1RoutinesMutationRequest,
	Routine,
	PostV1WorkoutsMutationRequest,
	PostV1WorkoutsMutationResponse,
	PutV1BodyMeasurementsDateMutationRequest,
	PutV1BodyMeasurementsDateMutationResponse,
	PutV1RoutinesRoutineidMutationRequest,
	PutV1RoutinesRoutineidMutationResponse,
	PutV1WorkoutsWorkoutidMutationRequest,
	PutV1WorkoutsWorkoutidMutationResponse,
} from "./generated/client/types";
import { createClient as createKubbClient } from "./hevy-client-kubb.js";
import type { HevyClientOptions } from "./hevy-client-kubb.js";
import type { HevyRequestOptions } from "./execution.js";

export type { HevyClientOptions };
export type { HevyRequestOptions } from "./execution.js";

export type { HevyOperationSafety } from "./execution.js";

export interface HevyClient {
	getWorkouts(
		params?: GetV1WorkoutsQueryParams,
		options?: HevyRequestOptions,
	): Promise<GetV1WorkoutsQueryResponse>;
	getWorkout(
		workoutId: string,
		options?: HevyRequestOptions,
	): Promise<GetV1WorkoutsWorkoutidQueryResponse>;
	createWorkout(
		data: PostV1WorkoutsMutationRequest,
		options?: HevyRequestOptions,
	): Promise<PostV1WorkoutsMutationResponse>;
	updateWorkout(
		workoutId: string,
		data: PutV1WorkoutsWorkoutidMutationRequest,
		options?: HevyRequestOptions,
	): Promise<PutV1WorkoutsWorkoutidMutationResponse>;
	getWorkoutCount(
		options?: HevyRequestOptions,
	): Promise<GetV1WorkoutsCountQueryResponse>;
	getWorkoutEvents(
		params?: GetV1WorkoutsEventsQueryParams,
		options?: HevyRequestOptions,
	): Promise<GetV1WorkoutsEventsQueryResponse>;
	getRoutines(
		params?: GetV1RoutinesQueryParams,
		options?: HevyRequestOptions,
	): Promise<GetV1RoutinesQueryResponse>;
	getRoutineById(
		routineId: string,
		options?: HevyRequestOptions,
	): Promise<GetV1RoutinesRoutineidQueryResponse>;
	createRoutine(
		data: PostV1RoutinesMutationRequest,
		options?: HevyRequestOptions,
	): Promise<Routine | undefined>;
	updateRoutine(
		routineId: string,
		data: PutV1RoutinesRoutineidMutationRequest,
		options?: HevyRequestOptions,
	): Promise<PutV1RoutinesRoutineidMutationResponse>;
	getExerciseTemplates(
		params?: GetV1ExerciseTemplatesQueryParams,
		options?: HevyRequestOptions,
	): Promise<GetV1ExerciseTemplatesQueryResponse>;
	getExerciseTemplate(
		templateId: string,
		options?: HevyRequestOptions,
	): Promise<GetV1ExerciseTemplatesExercisetemplateidQueryResponse>;
	getExerciseHistory(
		exerciseTemplateId: string,
		params?: GetV1ExerciseHistoryExercisetemplateidQueryParams,
		options?: HevyRequestOptions,
	): Promise<GetV1ExerciseHistoryExercisetemplateidQueryResponse>;
	createExerciseTemplate(
		data: PostV1ExerciseTemplatesMutationRequest,
		options?: HevyRequestOptions,
	): Promise<PostV1ExerciseTemplatesMutationResponse>;
	getRoutineFolders(
		params?: GetV1RoutineFoldersQueryParams,
		options?: HevyRequestOptions,
	): Promise<GetV1RoutineFoldersQueryResponse>;
	createRoutineFolder(
		data: PostV1RoutineFoldersMutationRequest,
		options?: HevyRequestOptions,
	): Promise<PostV1RoutineFoldersMutationResponse>;
	getRoutineFolder(
		folderId: string,
		options?: HevyRequestOptions,
	): Promise<GetV1RoutineFoldersFolderidQueryResponse>;
	getBodyMeasurements(
		params?: GetV1BodyMeasurementsQueryParams,
		options?: HevyRequestOptions,
	): Promise<GetV1BodyMeasurementsQueryResponse>;
	getBodyMeasurement(
		date: string,
		options?: HevyRequestOptions,
	): Promise<GetV1BodyMeasurementsDateQueryResponse>;
	createBodyMeasurement(
		data: PostV1BodyMeasurementsMutationRequest,
		options?: HevyRequestOptions,
	): Promise<PostV1BodyMeasurementsMutationResponse>;
	updateBodyMeasurement(
		date: string,
		data: PutV1BodyMeasurementsDateMutationRequest,
		options?: HevyRequestOptions,
	): Promise<PutV1BodyMeasurementsDateMutationResponse>;
	getUserInfo(
		options?: HevyRequestOptions,
	): Promise<GetV1UserInfoQueryResponse>;
}

export interface CreateHevyClientOptions extends HevyClientOptions {
	apiKey: string;
	baseUrl?: string;
}

export function createHevyClient({
	apiKey,
	baseUrl,
	...options
}: CreateHevyClientOptions): HevyClient {
	return createKubbClient(apiKey, baseUrl, options);
}
