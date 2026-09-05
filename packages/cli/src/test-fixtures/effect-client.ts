import { Effect } from "effect";
import { createHevyClient, type HevyClient } from "@hevy-mcp/hevy-client";

type RequestConfig = {
	readonly url?: string;
	readonly method?: string;
	readonly path?: RequestPath;
	readonly query?: RequestQuery;
	readonly body?: unknown;
	readonly signal?: AbortSignal;
	readonly hevyDeadline?: number;
	readonly hevyTimeoutMs?: number;
};

type RequestPath = {
	readonly workoutId?: string;
	readonly routineId?: string;
	readonly exerciseTemplateId?: string;
	readonly folderId?: string;
	readonly date?: string;
};

type RequestQuery = {
	readonly page?: number;
	readonly pageSize?: number;
	readonly since?: string;
	readonly start_date?: string;
	readonly end_date?: string;
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
			if (config.method === "POST") {
				const method = methods.createWorkout;
				if (method === undefined) return {};
				return options === undefined
					? method(config.body as never)
					: method(config.body as never, options);
			}
			const method = methods.getWorkouts;
			if (method === undefined) return {};
			return options === undefined
				? method(config.query)
				: method(config.query, options);
		}
		case "/v1/routines": {
			if (config.method === "POST") {
				const method = methods.createRoutine;
				if (method === undefined) return {};
				return options === undefined
					? method(config.body as never)
					: method(config.body as never, options);
			}
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
			const workoutId = config.path?.workoutId;
			if (workoutId === undefined) return {};
			if (config.method === "PUT") {
				const method = methods.updateWorkout;
				if (method === undefined) return {};
				return options === undefined
					? method(workoutId, config.body as never)
					: method(workoutId, config.body as never, options);
			}
			const method = methods.getWorkout;
			if (method === undefined) return {};
			return options === undefined
				? method(workoutId)
				: method(workoutId, options);
		}
		case "/v1/routines/{routineId}": {
			const routineId = config.path?.routineId;
			if (routineId === undefined) return {};
			if (config.method === "PUT") {
				const method = methods.updateRoutine;
				if (method === undefined) return {};
				return options === undefined
					? method(routineId, config.body as never)
					: method(routineId, config.body as never, options);
			}
			const method = methods.getRoutineById;
			if (method === undefined) return {};
			return options === undefined
				? method(routineId)
				: method(routineId, options);
		}
		case "/v1/workouts/events": {
			const method = methods.getWorkoutEvents;
			if (method === undefined) return {};
			return options === undefined
				? method(config.query)
				: method(config.query, options);
		}
		case "/v1/workouts/count": {
			const method = methods.getWorkoutCount;
			if (method === undefined) return {};
			return options === undefined ? method() : method(options);
		}
		case "/v1/exercise_templates": {
			if (config.method === "POST") {
				const method = methods.createExerciseTemplate;
				if (method === undefined) return {};
				return options === undefined
					? method(config.body as never)
					: method(config.body as never, options);
			}
			const method = methods.getExerciseTemplates;
			if (method === undefined) return {};
			return options === undefined
				? method(config.query)
				: method(config.query, options);
		}
		case "/v1/exercise_templates/{exerciseTemplateId}": {
			const method = methods.getExerciseTemplate;
			const exerciseTemplateId = config.path?.exerciseTemplateId;
			if (method === undefined || exerciseTemplateId === undefined) return {};
			return options === undefined
				? method(exerciseTemplateId)
				: method(exerciseTemplateId, options);
		}
		case "/v1/exercise_history/{exerciseTemplateId}": {
			const method = methods.getExerciseHistory;
			const exerciseTemplateId = config.path?.exerciseTemplateId;
			if (method === undefined || exerciseTemplateId === undefined) return {};
			return options === undefined
				? method(exerciseTemplateId, config.query)
				: method(exerciseTemplateId, config.query, options);
		}
		case "/v1/routine_folders": {
			if (config.method === "POST") {
				const method = methods.createRoutineFolder;
				if (method === undefined) return {};
				return options === undefined
					? method(config.body as never)
					: method(config.body as never, options);
			}
			const method = methods.getRoutineFolders;
			if (method === undefined) return {};
			return options === undefined
				? method(config.query)
				: method(config.query, options);
		}
		case "/v1/routine_folders/{folderId}": {
			const method = methods.getRoutineFolder;
			const folderId = config.path?.folderId;
			if (method === undefined || folderId === undefined) return {};
			return options === undefined
				? method(folderId)
				: method(folderId, options);
		}
		case "/v1/body_measurements": {
			if (config.method === "POST") {
				const method = methods.createBodyMeasurement;
				if (method === undefined) return {};
				return options === undefined
					? method(config.body as never)
					: method(config.body as never, options);
			}
			const method = methods.getBodyMeasurements;
			if (method === undefined) return {};
			return options === undefined
				? method(config.query)
				: method(config.query, options);
		}
		case "/v1/body_measurements/{date}": {
			const date = config.path?.date;
			if (date === undefined) return {};
			if (config.method === "PUT") {
				const method = methods.updateBodyMeasurement;
				if (method === undefined) return {};
				return options === undefined
					? method(date, config.body as never)
					: method(date, config.body as never, options);
			}
			const method = methods.getBodyMeasurement;
			if (method === undefined) return {};
			return options === undefined ? method(date) : method(date, options);
		}
		case "/v1/user/info": {
			const method = methods.getUserInfo;
			if (method === undefined) return {};
			const data =
				options === undefined ? await method() : await method(options);
			return { data };
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
