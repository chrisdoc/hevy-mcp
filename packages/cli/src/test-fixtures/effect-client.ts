import { Effect } from "effect";
import { createHevyClient, type HevyClient } from "@hevy-mcp/hevy-client";

type RequestConfig = {
	readonly url?: string;
	readonly path?: RequestPath;
	readonly query?: RequestQuery;
	readonly signal?: AbortSignal;
	readonly hevyDeadline?: number;
	readonly hevyTimeoutMs?: number;
};

type RequestPath = {
	readonly workoutId?: string;
	readonly routineId?: string;
};

type RequestQuery = {
	readonly page?: number;
	readonly pageSize?: number;
};

type RequestOptions = {
	readonly signal?: AbortSignal;
	readonly deadline?: number;
	readonly timeoutMs?: number;
};

type RequestEffectResponse = {
	readonly data: unknown;
	readonly status: number;
	readonly statusText: string;
	readonly headers: Headers;
};

type RequestEffect = (
	config: RequestConfig,
) => Effect.Effect<RequestEffectResponse, unknown>;

/**
 * Keep CLI test doubles compatible with the operations package's private
 * request-Effect seam while retaining Promise-shaped method spies for the
 * command assertions.
 */
export function createEffectClient(methods: Partial<HevyClient>): HevyClient {
	const native = createHevyClient({
		apiKey: "test-key",
		maxGetRetries: 0,
	});
	const seam = Object.getOwnPropertySymbols(native).find((symbol) =>
		symbol.description?.includes("native-request-effect"),
	);
	if (seam === undefined) {
		throw new Error("Missing native request Effect seam in test client");
	}
	const client = Object.assign(
		Object.create(Object.getPrototypeOf(native)),
		native,
		methods,
	) as HevyClient;
	Object.defineProperty(client, seam, {
		configurable: false,
		enumerable: false,
		value: ((config: RequestConfig) =>
			Effect.tryPromise({
				try: async () => ({
					data: await dispatch(methods, config),
					status: 200,
					statusText: "OK",
					headers: new Headers(),
				}),
				catch: (error) => error,
			})) satisfies RequestEffect,
		writable: false,
	});
	return client;
}

async function dispatch(
	methods: Partial<HevyClient>,
	config: RequestConfig,
): Promise<unknown> {
	const options = requestOptions(config);
	switch (config.url) {
		case "/v1/workouts": {
			const method = methods.getWorkouts;
			if (method === undefined) return {};
			return config.query === undefined
				? options === undefined
					? method()
					: method(undefined, options)
				: options === undefined
					? method(config.query)
					: method(config.query, options);
		}
		case "/v1/routines": {
			const method = methods.getRoutines;
			if (method === undefined) return {};
			return config.query === undefined
				? options === undefined
					? method()
					: method(undefined, options)
				: options === undefined
					? method(config.query)
					: method(config.query, options);
		}
		case "/v1/workouts/{workoutId}": {
			const method = methods.getWorkout;
			const workoutId = config.path?.workoutId;
			if (method === undefined || workoutId === undefined) return {};
			return options === undefined
				? method(workoutId)
				: method(workoutId, options);
		}
		case "/v1/routines/{routineId}": {
			const method = methods.getRoutineById;
			const routineId = config.path?.routineId;
			if (method === undefined || routineId === undefined) return {};
			return options === undefined
				? method(routineId)
				: method(routineId, options);
		}
		default:
			return {};
	}
}

function requestOptions(config: RequestConfig): RequestOptions | undefined {
	if (
		config.signal === undefined &&
		config.hevyDeadline === undefined &&
		config.hevyTimeoutMs === undefined
	) {
		return undefined;
	}
	return {
		signal: config.signal,
		deadline: config.hevyDeadline,
		timeoutMs: config.hevyTimeoutMs,
	};
}
