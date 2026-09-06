import { createHevyClient, type HevyClient } from "@hevy-mcp/hevy-client";

type RequestConfig = {
	readonly url?: string;
	readonly query?: RequestQuery;
	readonly signal?: AbortSignal;
	readonly hevyDeadline?: number;
	readonly hevyTimeoutMs?: number;
};

type RequestQuery = {
	readonly [key: string]: string | number | boolean | null | undefined;
};

type RequestOptions = {
	readonly signal?: AbortSignal;
	readonly deadline?: number;
	readonly timeoutMs?: number;
};

type RequestEffect = (config: RequestConfig) => unknown;

/**
 * Keep Worker test doubles compatible with the operations package's private
 * request-Effect seam while retaining Promise-shaped method spies for tests.
 */
export function createEffectClient(methods: Partial<HevyClient>): HevyClient {
	let currentRequest: RequestConfig | undefined;
	const native = createHevyClient({
		apiKey: "test-key",
		maxGetRetries: 0,
		fetch: async (input) => {
			const request = input instanceof Request ? input : new Request(input);
			const response = await dispatch(
				methods,
				new URL(request.url),
				requestOptions(currentRequest),
			);
			return new Response(JSON.stringify(response ?? {}), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		},
	});

	const seam = Object.getOwnPropertySymbols(native).find((symbol) =>
		symbol.description?.includes("native-request-effect"),
	);
	if (seam === undefined) {
		throw new Error("Missing native request Effect seam in test client");
	}
	const nativeRequestEffect = Reflect.get(native, seam) as RequestEffect;
	const client = Object.assign(
		Object.create(Object.getPrototypeOf(native)),
		native,
		methods,
	) as HevyClient;
	Object.defineProperty(client, seam, {
		configurable: false,
		enumerable: false,
		value: ((config: RequestConfig) => {
			currentRequest = config;
			return nativeRequestEffect(config);
		}) satisfies RequestEffect,
		writable: false,
	});
	return client;
}

function requestOptions(
	config: RequestConfig | undefined,
): RequestOptions | undefined {
	if (
		config?.signal === undefined &&
		config?.hevyDeadline === undefined &&
		config?.hevyTimeoutMs === undefined
	) {
		return undefined;
	}
	return {
		signal: config?.signal,
		deadline: config?.hevyDeadline,
		timeoutMs: config?.hevyTimeoutMs,
	};
}

async function dispatch(
	methods: Partial<HevyClient>,
	url: URL,
	options: RequestOptions | undefined,
): Promise<unknown> {
	if (url.pathname === "/v1/workouts") {
		const query = paginationQuery(url);
		const method = methods.getWorkouts;
		if (method === undefined) return {};
		if (query === undefined) {
			return options === undefined ? method() : method(undefined, options);
		}
		return options === undefined ? method(query) : method(query, options);
	}
	if (url.pathname.startsWith("/v1/workouts/")) {
		const method = methods.getWorkout;
		if (method === undefined) return {};
		return method(
			decodeURIComponent(url.pathname.slice("/v1/workouts/".length)),
			options,
		);
	}
	if (url.pathname === "/v1/exercise_templates") {
		const query = paginationQuery(url);
		const method = methods.getExerciseTemplates;
		if (method === undefined) return {};
		if (query === undefined) {
			return options === undefined ? method() : method(undefined, options);
		}
		return options === undefined ? method(query) : method(query, options);
	}
	if (url.pathname === "/v1/routines") {
		const query = paginationQuery(url);
		const method = methods.getRoutines;
		if (method === undefined) return {};
		if (query === undefined) {
			return options === undefined ? method() : method(undefined, options);
		}
		return options === undefined ? method(query) : method(query, options);
	}
	if (url.pathname.startsWith("/v1/routines/")) {
		const method = methods.getRoutineById;
		if (method === undefined) return {};
		return method(
			decodeURIComponent(url.pathname.slice("/v1/routines/".length)),
			options,
		);
	}
	return {};
}

function paginationQuery(
	url: URL,
): { readonly page: number; readonly pageSize: number } | undefined {
	if (url.search.length === 0) return undefined;
	return {
		page: Number(url.searchParams.get("page")),
		pageSize: Number(url.searchParams.get("pageSize")),
	};
}
