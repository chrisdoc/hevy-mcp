import type {
	BodyMeasurement,
	CreateCustomExerciseRequestBody,
	GetV1BodyMeasurementsQuery,
	GetV1BodyMeasurementsStatus200,
	GetV1BodyMeasurementsDateStatus200,
	GetV1ExerciseHistoryExercisetemplateidQuery,
	GetV1ExerciseHistoryExercisetemplateidStatus200,
	GetV1ExerciseTemplatesQuery,
	GetV1ExerciseTemplatesStatus200,
	GetV1ExerciseTemplatesExercisetemplateidStatus200,
	GetV1RoutineFoldersQuery,
	GetV1RoutineFoldersStatus200,
	GetV1RoutineFoldersFolderidStatus200,
	GetV1RoutinesQuery,
	GetV1RoutinesStatus200,
	GetV1RoutinesRoutineidStatus200,
	GetV1UserInfoStatus200,
	GetV1WorkoutsEventsQuery,
	GetV1WorkoutsEventsStatus200,
	GetV1WorkoutsQuery,
	GetV1WorkoutsStatus200,
	GetV1WorkoutsCountStatus200,
	GetV1WorkoutsWorkoutidStatus200,
	PostRoutineFolderRequestBody,
	PostRoutinesRequestBody,
	PostWorkoutsRequestBody,
	PostV1BodyMeasurementsStatus200,
	PostV1ExerciseTemplatesStatus200,
	PostV1RoutineFoldersStatus201,
	PostV1WorkoutsStatus201,
	PutBodyMeasurement,
	PutRoutinesRequestBody,
	PutV1BodyMeasurementsDateStatus200,
	PutV1RoutinesRoutineidStatus200,
	PutV1WorkoutsWorkoutidStatus200,
	Routine,
} from "./generated/client/types/index.js";
import { createClient as createKubbClient } from "./hevy-client-kubb.js";
import type { HevyClientOptions } from "./hevy-client-kubb.js";
import type { HevyRequestOptions } from "./execution.js";
import { NATIVE_REQUEST_EFFECT } from "./internal-request-effect.js";

export type { HevyClientOptions };
export type { HevyRequestOptions } from "./execution.js";
export type { HevyOperationSafety } from "./execution.js";

export interface HevyClient {
	getWorkouts(
		params?: GetV1WorkoutsQuery,
		options?: HevyRequestOptions,
	): Promise<GetV1WorkoutsStatus200>;
	getWorkout(
		workoutId: string,
		options?: HevyRequestOptions,
	): Promise<GetV1WorkoutsWorkoutidStatus200>;
	createWorkout(
		data: PostWorkoutsRequestBody,
		options?: HevyRequestOptions,
	): Promise<PostV1WorkoutsStatus201>;
	updateWorkout(
		workoutId: string,
		data: PostWorkoutsRequestBody,
		options?: HevyRequestOptions,
	): Promise<PutV1WorkoutsWorkoutidStatus200>;
	getWorkoutCount(
		options?: HevyRequestOptions,
	): Promise<GetV1WorkoutsCountStatus200>;
	getWorkoutEvents(
		params?: GetV1WorkoutsEventsQuery,
		options?: HevyRequestOptions,
	): Promise<GetV1WorkoutsEventsStatus200>;
	getRoutines(
		params?: GetV1RoutinesQuery,
		options?: HevyRequestOptions,
	): Promise<GetV1RoutinesStatus200>;
	getRoutineById(
		routineId: string,
		options?: HevyRequestOptions,
	): Promise<GetV1RoutinesRoutineidStatus200>;
	createRoutine(
		data: PostRoutinesRequestBody,
		options?: HevyRequestOptions,
	): Promise<Routine | undefined>;
	updateRoutine(
		routineId: string,
		data: PutRoutinesRequestBody,
		options?: HevyRequestOptions,
	): Promise<PutV1RoutinesRoutineidStatus200>;
	getExerciseTemplates(
		params?: GetV1ExerciseTemplatesQuery,
		options?: HevyRequestOptions,
	): Promise<GetV1ExerciseTemplatesStatus200>;
	getExerciseTemplate(
		templateId: string,
		options?: HevyRequestOptions,
	): Promise<GetV1ExerciseTemplatesExercisetemplateidStatus200>;
	getExerciseHistory(
		exerciseTemplateId: string,
		params?: GetV1ExerciseHistoryExercisetemplateidQuery,
		options?: HevyRequestOptions,
	): Promise<GetV1ExerciseHistoryExercisetemplateidStatus200>;
	createExerciseTemplate(
		data: CreateCustomExerciseRequestBody,
		options?: HevyRequestOptions,
	): Promise<PostV1ExerciseTemplatesStatus200>;
	getRoutineFolders(
		params?: GetV1RoutineFoldersQuery,
		options?: HevyRequestOptions,
	): Promise<GetV1RoutineFoldersStatus200>;
	createRoutineFolder(
		data: PostRoutineFolderRequestBody,
		options?: HevyRequestOptions,
	): Promise<PostV1RoutineFoldersStatus201>;
	getRoutineFolder(
		folderId: string,
		options?: HevyRequestOptions,
	): Promise<GetV1RoutineFoldersFolderidStatus200>;
	getBodyMeasurements(
		params?: GetV1BodyMeasurementsQuery,
		options?: HevyRequestOptions,
	): Promise<GetV1BodyMeasurementsStatus200>;
	getBodyMeasurement(
		date: string,
		options?: HevyRequestOptions,
	): Promise<GetV1BodyMeasurementsDateStatus200>;
	createBodyMeasurement(
		data: BodyMeasurement,
		options?: HevyRequestOptions,
	): Promise<PostV1BodyMeasurementsStatus200>;
	updateBodyMeasurement(
		date: string,
		data: PutBodyMeasurement,
		options?: HevyRequestOptions,
	): Promise<PutV1BodyMeasurementsDateStatus200>;
	getUserInfo(options?: HevyRequestOptions): Promise<GetV1UserInfoStatus200>;
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
	const { client, requestEffect } = createKubbClient(apiKey, baseUrl, options);
	Object.defineProperty(client, NATIVE_REQUEST_EFFECT, {
		configurable: false,
		enumerable: false,
		value: requestEffect,
		writable: false,
	});
	return client;
}
