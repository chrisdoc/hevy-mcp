import { Effect } from "effect";
import { z } from "zod";
import type {
	BodyMeasurement,
	CreateCustomExerciseRequestBody,
	GetV1BodyMeasurementsDate200,
	GetV1BodyMeasurements200,
	GetV1BodyMeasurementsQuery,
	GetV1ExerciseHistoryExercisetemplateid200,
	GetV1ExerciseHistoryExercisetemplateidQuery,
	GetV1ExerciseTemplatesExercisetemplateid200,
	GetV1ExerciseTemplates200,
	GetV1ExerciseTemplatesQuery,
	GetV1RoutineFolders200,
	GetV1RoutineFoldersFolderid200,
	GetV1RoutineFoldersQuery,
	GetV1Routines200,
	GetV1RoutinesQuery,
	GetV1RoutinesRoutineid200,
	UserInfoResponse,
	GetV1WorkoutsCount200,
	GetV1WorkoutsEvents200,
	GetV1WorkoutsEventsQuery,
	GetV1Workouts200,
	GetV1WorkoutsQuery,
	GetV1WorkoutsWorkoutid200,
	PostRoutinesRequestBody,
	PostRoutineFolderRequestBody,
	PostV1BodyMeasurements200,
	PostV1ExerciseTemplates200,
	PostV1Routines201,
	PostV1RoutineFolders201,
	PostV1Workouts201,
	PostWorkoutsRequestBody,
	PutBodyMeasurement,
	PutRoutinesRequestBody,
	PutV1BodyMeasurementsDateStatus200,
	PutV1RoutinesRoutineid200,
	PutV1WorkoutsWorkoutid200,
} from "./types.js";
import type { HevyRequestOptions } from "./execution.js";
import type { RequestConfig, ResponseConfig } from "./fetch.ts";

/**
 * Private attachment used to connect a curated Promise client to its native
 * request interpreter without adding an Effect method to `HevyClient`.
 */
export const NATIVE_REQUEST_EFFECT = Symbol("native-request-effect");

export type NativeRequestEffect = <TData, TVariables = unknown>(
	config: RequestConfig<TVariables> & {
		readonly hevyDeadline?: number;
		readonly hevyTimeoutMs?: number;
	},
) => Effect.Effect<ResponseConfig<TData>, unknown>;

export interface HevyRequestEffectClient {
	getWorkouts(
		params?: GetV1WorkoutsQuery,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1Workouts200, Error>;
	getWorkout(
		workoutId: string,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1WorkoutsWorkoutid200, Error>;
	createWorkout(
		data: PostWorkoutsRequestBody,
		options?: HevyRequestOptions,
	): Effect.Effect<PostV1Workouts201, Error>;
	updateWorkout(
		workoutId: string,
		data: PostWorkoutsRequestBody,
		options?: HevyRequestOptions,
	): Effect.Effect<PutV1WorkoutsWorkoutid200, Error>;
	getWorkoutEvents(
		params?: GetV1WorkoutsEventsQuery,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1WorkoutsEvents200, Error>;
	getWorkoutCount(
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1WorkoutsCount200, Error>;
	getRoutines(
		params?: GetV1RoutinesQuery,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1Routines200, Error>;
	getRoutineById(
		routineId: string,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1RoutinesRoutineid200, Error>;
	createRoutine(
		data: PostRoutinesRequestBody,
		options?: HevyRequestOptions,
	): Effect.Effect<PostV1Routines201, Error>;
	updateRoutine(
		routineId: string,
		data: PutRoutinesRequestBody,
		options?: HevyRequestOptions,
	): Effect.Effect<PutV1RoutinesRoutineid200, Error>;
	getExerciseTemplates(
		params?: GetV1ExerciseTemplatesQuery,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1ExerciseTemplates200, Error>;
	getExerciseTemplate(
		templateId: string,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1ExerciseTemplatesExercisetemplateid200, Error>;
	getExerciseHistory(
		exerciseTemplateId: string,
		params?: GetV1ExerciseHistoryExercisetemplateidQuery,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1ExerciseHistoryExercisetemplateid200, Error>;
	createExerciseTemplate(
		data: CreateCustomExerciseRequestBody,
		options?: HevyRequestOptions,
	): Effect.Effect<PostV1ExerciseTemplates200, Error>;
	getRoutineFolders(
		params?: GetV1RoutineFoldersQuery,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1RoutineFolders200, Error>;
	getRoutineFolder(
		folderId: string,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1RoutineFoldersFolderid200, Error>;
	createRoutineFolder(
		data: PostRoutineFolderRequestBody,
		options?: HevyRequestOptions,
	): Effect.Effect<PostV1RoutineFolders201, Error>;
	getBodyMeasurements(
		params?: GetV1BodyMeasurementsQuery,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1BodyMeasurements200, Error>;
	getBodyMeasurement(
		date: string,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1BodyMeasurementsDate200, Error>;
	createBodyMeasurement(
		data: BodyMeasurement,
		options?: HevyRequestOptions,
	): Effect.Effect<PostV1BodyMeasurements200, Error>;
	updateBodyMeasurement(
		date: string,
		data: PutBodyMeasurement,
		options?: HevyRequestOptions,
	): Effect.Effect<PutV1BodyMeasurementsDateStatus200, Error>;
	getUserInfo(
		options?: HevyRequestOptions,
	): Effect.Effect<UserInfoResponse, Error>;
}

type RequestExecutionControl = {
	readonly signal?: AbortSignal;
	readonly hevyDeadline?: number;
	readonly hevyTimeoutMs?: number;
};

type RequestEffectMethod = (...args: never[]) => void;

type RequestEffectAttachment = {
	readonly requestEffect: NativeRequestEffect;
};

type CuratedClientWithNativeRequestEffect = {
	readonly [NATIVE_REQUEST_EFFECT]?: NativeRequestEffect;
} & (
	| { readonly getWorkouts: RequestEffectMethod }
	| { readonly getWorkout: RequestEffectMethod }
	| { readonly getRoutines: RequestEffectMethod }
	| { readonly getRoutineById: RequestEffectMethod }
);

type RequestEffectOwner =
	| RequestEffectAttachment
	| CuratedClientWithNativeRequestEffect;

const functionSchema = z.function();

function isNativeRequestEffect(
	value: NativeRequestEffect | undefined,
): value is NativeRequestEffect {
	return functionSchema.safeParse(value).success;
}

/**
 * Return the request interpreter owned by a curated client.
 *
 * This is intentionally available only from the client's internal subpath.
 * The returned interpreter is the same one used by every Promise method on
 * the client, including its retry, timeout, abort, and error behavior.
 */
export function getNativeRequestEffect(
	client: RequestEffectOwner,
): NativeRequestEffect {
	const requestEffect =
		"requestEffect" in client
			? client.requestEffect
			: client[NATIVE_REQUEST_EFFECT];
	if (!isNativeRequestEffect(requestEffect)) {
		throw new TypeError(
			"Expected a Hevy client with the internal request Effect seam",
		);
	}
	return requestEffect;
}

const noExecutionControl = {};

function executionControl(
	options: HevyRequestOptions | undefined,
): RequestExecutionControl {
	if (options === undefined) return noExecutionControl;
	const control = {
		signal: options.signal,
		hevyDeadline: options.deadline,
		hevyTimeoutMs: options.timeoutMs,
	} satisfies RequestExecutionControl;
	return control;
}

function requestDataEffect<TData, TVariables = unknown>(
	requestEffect: NativeRequestEffect,
	config: RequestConfig<TVariables>,
	options?: HevyRequestOptions,
): Effect.Effect<TData, Error> {
	return requestEffect({
		...config,
		...executionControl(options),
	}).pipe(
		Effect.map((response) => response.data as TData),
		Effect.mapError((cause) =>
			cause instanceof Error ? cause : new Error(String(cause)),
		),
	) as Effect.Effect<TData, Error>;
}

/**
 * Build the Effect operations used by the runtime-neutral operations package.
 *
 * Every method calls the native interpreter directly. The Promise client and
 * this facade therefore share request encoding, retry, timeout, and abort
 * behavior without exposing Effect on the public client.
 */
export function getRequestEffectClient(
	client: RequestEffectOwner,
): HevyRequestEffectClient {
	const requestEffect = getNativeRequestEffect(client);
	return {
		getWorkouts: (params, options) =>
			requestDataEffect<GetV1Workouts200>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/workouts",
					query: params,
				},
				options,
			),
		getWorkout: (workoutId, options) =>
			requestDataEffect<GetV1WorkoutsWorkoutid200>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/workouts/{workoutId}",
					path: { workoutId },
				},
				options,
			),
		createWorkout: (data, options) =>
			requestDataEffect<PostV1Workouts201>(
				requestEffect,
				{
					method: "POST",
					url: "/v1/workouts",
					body: data,
				},
				options,
			),
		updateWorkout: (workoutId, data, options) =>
			requestDataEffect<PutV1WorkoutsWorkoutid200>(
				requestEffect,
				{
					method: "PUT",
					url: "/v1/workouts/{workoutId}",
					path: { workoutId },
					body: data,
				},
				options,
			),
		getWorkoutEvents: (params, options) =>
			requestDataEffect<GetV1WorkoutsEvents200>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/workouts/events",
					query: params,
				},
				options,
			),
		getWorkoutCount: (options) =>
			requestDataEffect<GetV1WorkoutsCount200>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/workouts/count",
				},
				options,
			),
		getRoutines: (params, options) =>
			requestDataEffect<GetV1Routines200>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/routines",
					query: params,
				},
				options,
			),
		getRoutineById: (routineId, options) =>
			requestDataEffect<GetV1RoutinesRoutineid200>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/routines/{routineId}",
					path: { routineId },
				},
				options,
			),
		createRoutine: (data, options) =>
			requestDataEffect<PostV1Routines201>(
				requestEffect,
				{
					method: "POST",
					url: "/v1/routines",
					body: data,
				},
				options,
			),
		updateRoutine: (routineId, data, options) =>
			requestDataEffect<PutV1RoutinesRoutineid200>(
				requestEffect,
				{
					method: "PUT",
					url: "/v1/routines/{routineId}",
					path: { routineId },
					body: data,
				},
				options,
			),
		getExerciseTemplates: (params, options) =>
			requestDataEffect<GetV1ExerciseTemplates200>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/exercise_templates",
					query: params,
				},
				options,
			),
		getExerciseTemplate: (templateId, options) =>
			requestDataEffect<GetV1ExerciseTemplatesExercisetemplateid200>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/exercise_templates/{exerciseTemplateId}",
					path: { exerciseTemplateId: templateId },
				},
				options,
			),
		getExerciseHistory: (exerciseTemplateId, params, options) =>
			requestDataEffect<GetV1ExerciseHistoryExercisetemplateid200>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/exercise_history/{exerciseTemplateId}",
					path: { exerciseTemplateId },
					query: params,
				},
				options,
			),
		createExerciseTemplate: (data, options) =>
			requestDataEffect<PostV1ExerciseTemplates200>(
				requestEffect,
				{
					method: "POST",
					url: "/v1/exercise_templates",
					body: data,
				},
				options,
			),
		getRoutineFolders: (params, options) =>
			requestDataEffect<GetV1RoutineFolders200>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/routine_folders",
					query: params,
				},
				options,
			),
		getRoutineFolder: (folderId, options) =>
			requestDataEffect<GetV1RoutineFoldersFolderid200>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/routine_folders/{folderId}",
					path: { folderId },
				},
				options,
			),
		createRoutineFolder: (data, options) =>
			requestDataEffect<PostV1RoutineFolders201>(
				requestEffect,
				{
					method: "POST",
					url: "/v1/routine_folders",
					body: data,
				},
				options,
			),
		getBodyMeasurements: (params, options) =>
			requestDataEffect<GetV1BodyMeasurements200>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/body_measurements",
					query: params,
				},
				options,
			),
		getBodyMeasurement: (date, options) =>
			requestDataEffect<GetV1BodyMeasurementsDate200>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/body_measurements/{date}",
					path: { date },
				},
				options,
			),
		createBodyMeasurement: (data, options) =>
			requestDataEffect<PostV1BodyMeasurements200>(
				requestEffect,
				{
					method: "POST",
					url: "/v1/body_measurements",
					body: data,
				},
				options,
			),
		updateBodyMeasurement: (date, data, options) =>
			requestDataEffect<PutV1BodyMeasurementsDateStatus200>(
				requestEffect,
				{
					method: "PUT",
					url: "/v1/body_measurements/{date}",
					path: { date },
					body: data,
				},
				options,
			),
		getUserInfo: (options) =>
			requestDataEffect<UserInfoResponse>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/user/info",
				},
				options,
			),
	};
}

/**
 * Stable internal factory name for consumers that want the Effect request
 * facade. It is deliberately not re-exported from the package's main entry.
 */
export const createRequestEffect = getRequestEffectClient;
