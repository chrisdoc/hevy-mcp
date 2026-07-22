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
	PostV1RoutinesMutationResponse,
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

export type { HevyClientOptions };

export interface HevyRequestOptions {
	readonly signal?: AbortSignal;
}

export interface HevyClient {
	getWorkouts(
		params?: GetV1WorkoutsQueryParams,
	): Promise<GetV1WorkoutsQueryResponse>;
	getWorkout(workoutId: string): Promise<GetV1WorkoutsWorkoutidQueryResponse>;
	createWorkout(
		data: PostV1WorkoutsMutationRequest,
	): Promise<PostV1WorkoutsMutationResponse>;
	updateWorkout(
		workoutId: string,
		data: PutV1WorkoutsWorkoutidMutationRequest,
	): Promise<PutV1WorkoutsWorkoutidMutationResponse>;
	getWorkoutCount(): Promise<GetV1WorkoutsCountQueryResponse>;
	getWorkoutEvents(
		params?: GetV1WorkoutsEventsQueryParams,
	): Promise<GetV1WorkoutsEventsQueryResponse>;
	getRoutines(
		params?: GetV1RoutinesQueryParams,
	): Promise<GetV1RoutinesQueryResponse>;
	getRoutineById(
		routineId: string,
	): Promise<GetV1RoutinesRoutineidQueryResponse>;
	createRoutine(
		data: PostV1RoutinesMutationRequest,
	): Promise<PostV1RoutinesMutationResponse>;
	updateRoutine(
		routineId: string,
		data: PutV1RoutinesRoutineidMutationRequest,
	): Promise<PutV1RoutinesRoutineidMutationResponse>;
	getExerciseTemplates(
		params?: GetV1ExerciseTemplatesQueryParams,
	): Promise<GetV1ExerciseTemplatesQueryResponse>;
	getExerciseTemplate(
		templateId: string,
	): Promise<GetV1ExerciseTemplatesExercisetemplateidQueryResponse>;
	getExerciseHistory(
		exerciseTemplateId: string,
		params?: GetV1ExerciseHistoryExercisetemplateidQueryParams,
	): Promise<GetV1ExerciseHistoryExercisetemplateidQueryResponse>;
	createExerciseTemplate(
		data: PostV1ExerciseTemplatesMutationRequest,
	): Promise<PostV1ExerciseTemplatesMutationResponse>;
	getRoutineFolders(
		params?: GetV1RoutineFoldersQueryParams,
	): Promise<GetV1RoutineFoldersQueryResponse>;
	createRoutineFolder(
		data: PostV1RoutineFoldersMutationRequest,
	): Promise<PostV1RoutineFoldersMutationResponse>;
	getRoutineFolder(
		folderId: string,
	): Promise<GetV1RoutineFoldersFolderidQueryResponse>;
	getBodyMeasurements(
		params?: GetV1BodyMeasurementsQueryParams,
	): Promise<GetV1BodyMeasurementsQueryResponse>;
	getBodyMeasurement(
		date: string,
	): Promise<GetV1BodyMeasurementsDateQueryResponse>;
	createBodyMeasurement(
		data: PostV1BodyMeasurementsMutationRequest,
	): Promise<PostV1BodyMeasurementsMutationResponse>;
	updateBodyMeasurement(
		date: string,
		data: PutV1BodyMeasurementsDateMutationRequest,
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
