import { Effect, Predicate } from "effect";
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
import {
	ApiError,
	NetworkError,
	NotFoundError,
	RateLimitError,
	ValidationError,
} from "./effect-errors.js";
import {
	canonicalEndpointIdentity,
	expectedGet404Outcome,
} from "./endpoint-policy.js";
import { HevyHttpError } from "./hevy-http-error.js";

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

export type HevyRequestEffectError =
	| NotFoundError
	| ValidationError
	| RateLimitError
	| ApiError
	| NetworkError
	| Error;

export interface HevyRequestEffectClient {
	getWorkouts(
		params?: GetV1WorkoutsQuery,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1Workouts200, HevyRequestEffectError>;
	getWorkout(
		workoutId: string,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1WorkoutsWorkoutid200, HevyRequestEffectError>;
	createWorkout(
		data: PostWorkoutsRequestBody,
		options?: HevyRequestOptions,
	): Effect.Effect<PostV1Workouts201, HevyRequestEffectError>;
	updateWorkout(
		workoutId: string,
		data: PostWorkoutsRequestBody,
		options?: HevyRequestOptions,
	): Effect.Effect<PutV1WorkoutsWorkoutid200, HevyRequestEffectError>;
	getWorkoutEvents(
		params?: GetV1WorkoutsEventsQuery,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1WorkoutsEvents200, HevyRequestEffectError>;
	getWorkoutCount(
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1WorkoutsCount200, HevyRequestEffectError>;
	getRoutines(
		params?: GetV1RoutinesQuery,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1Routines200, HevyRequestEffectError>;
	getRoutineById(
		routineId: string,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1RoutinesRoutineid200, HevyRequestEffectError>;
	createRoutine(
		data: PostRoutinesRequestBody,
		options?: HevyRequestOptions,
	): Effect.Effect<PostV1Routines201, HevyRequestEffectError>;
	updateRoutine(
		routineId: string,
		data: PutRoutinesRequestBody,
		options?: HevyRequestOptions,
	): Effect.Effect<PutV1RoutinesRoutineid200, HevyRequestEffectError>;
	getExerciseTemplates(
		params?: GetV1ExerciseTemplatesQuery,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1ExerciseTemplates200, HevyRequestEffectError>;
	getExerciseTemplate(
		templateId: string,
		options?: HevyRequestOptions,
	): Effect.Effect<
		GetV1ExerciseTemplatesExercisetemplateid200,
		HevyRequestEffectError
	>;
	getExerciseHistory(
		exerciseTemplateId: string,
		params?: GetV1ExerciseHistoryExercisetemplateidQuery,
		options?: HevyRequestOptions,
	): Effect.Effect<
		GetV1ExerciseHistoryExercisetemplateid200,
		HevyRequestEffectError
	>;
	createExerciseTemplate(
		data: CreateCustomExerciseRequestBody,
		options?: HevyRequestOptions,
	): Effect.Effect<PostV1ExerciseTemplates200, HevyRequestEffectError>;
	getRoutineFolders(
		params?: GetV1RoutineFoldersQuery,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1RoutineFolders200, HevyRequestEffectError>;
	getRoutineFolder(
		folderId: string,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1RoutineFoldersFolderid200, HevyRequestEffectError>;
	createRoutineFolder(
		data: PostRoutineFolderRequestBody,
		options?: HevyRequestOptions,
	): Effect.Effect<PostV1RoutineFolders201, HevyRequestEffectError>;
	getBodyMeasurements(
		params?: GetV1BodyMeasurementsQuery,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1BodyMeasurements200, HevyRequestEffectError>;
	getBodyMeasurement(
		date: string,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1BodyMeasurementsDate200, HevyRequestEffectError>;
	createBodyMeasurement(
		data: BodyMeasurement,
		options?: HevyRequestOptions,
	): Effect.Effect<PostV1BodyMeasurements200, HevyRequestEffectError>;
	updateBodyMeasurement(
		date: string,
		data: PutBodyMeasurement,
		options?: HevyRequestOptions,
	): Effect.Effect<PutV1BodyMeasurementsDateStatus200, HevyRequestEffectError>;
	getUserInfo(
		options?: HevyRequestOptions,
	): Effect.Effect<UserInfoResponse, HevyRequestEffectError>;
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

function retryAfterSeconds(error: HevyHttpError): number | undefined {
	const value = error.headers?.get("retry-after");
	if (value === null || value === undefined || value.length === 0) {
		return undefined;
	}
	const seconds = Number(value);
	return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function requestPage(config: RequestConfig<unknown>): number | undefined {
	const query = config.query ?? config.params;
	return Predicate.isObject(query) && Predicate.isNumber(query.page)
		? query.page
		: undefined;
}

type RequestIdentity = {
	readonly method: string;
	readonly endpoint: string;
	readonly page?: number;
};

function requestIdentity(
	config: RequestConfig<unknown>,
	cause: unknown,
): RequestIdentity {
	const method = (
		config.method ?? (cause instanceof HevyHttpError ? cause.method : "GET")
	).toUpperCase();
	const endpoint = canonicalEndpointIdentity(
		config.url ?? (cause instanceof HevyHttpError ? cause.endpoint : ""),
	);
	return {
		method,
		endpoint,
		page: requestPage(config),
	} satisfies RequestIdentity;
}

function executionMetadata(error: HevyHttpError) {
	return {
		phase: error.phase,
		operationSafety: error.operationSafety,
		commitState: error.commitState,
		safeToRetry: error.safeToRetry,
		outcome: error.outcome,
	};
}

function networkError(cause: unknown): NetworkError {
	const httpError = cause instanceof HevyHttpError ? cause : undefined;
	return new NetworkError({
		code: httpError?.code ?? "ERR_NETWORK",
		phase: httpError?.phase,
		operationSafety: httpError?.operationSafety,
		commitState: httpError?.commitState,
		safeToRetry: httpError?.safeToRetry,
		outcome: httpError?.outcome,
		retryCount: httpError?.hevyRetryCount,
		retryExhausted: httpError?.hevyRetryExhausted === true,
	});
}

function mapRequestError(
	cause: unknown,
	config: RequestConfig<unknown>,
): HevyRequestEffectError {
	const identity = requestIdentity(config, cause);
	if (!(cause instanceof HevyHttpError) || cause.status === undefined) {
		return networkError(cause);
	}
	const { status } = cause;
	if (status === 404) {
		return new NotFoundError({
			status,
			method: identity.method,
			endpoint: identity.endpoint,
			expected:
				expectedGet404Outcome(
					identity.endpoint,
					identity.method,
					status,
					identity.page,
				) !== undefined,
			...executionMetadata(cause),
		});
	}
	if (status === 400) {
		return new ValidationError({
			status,
			method: identity.method,
			endpoint: identity.endpoint,
			...executionMetadata(cause),
		});
	}
	if (status === 429) {
		return new RateLimitError({
			status,
			method: identity.method,
			endpoint: identity.endpoint,
			retryAfterSeconds: retryAfterSeconds(cause),
			...executionMetadata(cause),
			retryCount: cause.hevyRetryCount,
			retryExhausted: cause.hevyRetryExhausted,
		});
	}
	return new ApiError({
		status,
		method: identity.method,
		endpoint: identity.endpoint,
		...executionMetadata(cause),
	});
}

function requestDataEffect<TData, TVariables = unknown>(
	requestEffect: NativeRequestEffect,
	config: RequestConfig<TVariables>,
	options?: HevyRequestOptions,
): Effect.Effect<TData, HevyRequestEffectError> {
	return requestEffect({
		...config,
		...executionControl(options),
	}).pipe(
		Effect.map((response) => response.data as TData),
		Effect.mapError((cause) =>
			mapRequestError(cause, config as RequestConfig<unknown>),
		),
	);
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
