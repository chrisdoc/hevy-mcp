import { Effect } from "effect";
import { z } from "zod";
import type {
	GetV1Routines200,
	GetV1RoutinesRoutineid200,
	GetV1Workouts200,
	GetV1WorkoutsWorkoutid200,
	GetV1RoutinesQuery,
	GetV1WorkoutsQuery,
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
	getRoutines(
		params?: GetV1RoutinesQuery,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1Routines200, Error>;
	getRoutineById(
		routineId: string,
		options?: HevyRequestOptions,
	): Effect.Effect<GetV1RoutinesRoutineid200, Error>;
}

type RequestEffectMethod = (...args: never[]) => void;

type RequestExecutionControl = {
	readonly signal?: AbortSignal;
	readonly hevyDeadline?: number;
	readonly hevyTimeoutMs?: number;
};

type NativeRequestEffectOwner = {
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
	| NativeRequestEffectOwner
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

function readEffect<TData>(
	requestEffect: NativeRequestEffect,
	config: RequestConfig,
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
 * Build the four read operations used by the runtime-neutral operations
 * package. These methods return Effects, but remain on the internal subpath so
 * public Promise callers and adapters never see the Effect surface.
 */
export function getRequestEffectClient(
	client: RequestEffectOwner,
): HevyRequestEffectClient {
	const requestEffect = getNativeRequestEffect(client);
	return {
		getWorkouts: (params, options) =>
			readEffect<GetV1Workouts200>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/workouts",
					query: params,
				},
				options,
			),
		getWorkout: (workoutId, options) =>
			readEffect<GetV1WorkoutsWorkoutid200>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/workouts/{workoutId}",
					path: { workoutId },
				},
				options,
			),
		getRoutines: (params, options) =>
			readEffect<GetV1Routines200>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/routines",
					query: params,
				},
				options,
			),
		getRoutineById: (routineId, options) =>
			readEffect<GetV1RoutinesRoutineid200>(
				requestEffect,
				{
					method: "GET",
					url: "/v1/routines/{routineId}",
					path: { routineId },
				},
				options,
			),
	};
}

/**
 * Stable internal factory name for consumers that want the Effect read
 * facade. It is deliberately not re-exported from the package's main entry.
 */
export const createRequestEffect = getRequestEffectClient;
