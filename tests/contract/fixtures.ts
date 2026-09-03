import { createHevyClient, type HevyClient } from "@hevy-mcp/hevy-client";
import type { GetV1Workouts200 } from "@hevy-mcp/hevy-client/types";
import { getWorkoutsCapabilityDescriptor } from "@hevy-mcp/core";

export const deterministicWorkout = {
	id: "workout-1",
	title: "Contract fixture",
	start_time: "2025-01-01T10:00:00Z",
	end_time: "2025-01-01T10:30:00Z",
	exercises: [],
} satisfies NonNullable<GetV1Workouts200["workouts"]>[number];

/** Minimal generated-client result consumed by the production get-workouts tool. */
export const deterministicGetWorkoutsResult: GetV1Workouts200 = {
	page: 1,
	workouts: [deterministicWorkout],
	page_count: 1,
};

/** Valid structured output, parsed with the production capability schema. */
export const validGetWorkoutsOutput =
	getWorkoutsCapabilityDescriptor.outputSchema.parse({
		workouts: [
			{
				id: "workout-1",
				title: "Contract fixture",
				start_time: "2025-01-01T10:00:00Z",
				end_time: "2025-01-01T10:30:00Z",
				duration: "0h 30m 0s",
				exercise_count: 0,
				set_count: 0,
			},
		],
		page: 1,
		page_count: 1,
		has_next_page: false,
	});

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

type RequestEffect = (config: RequestConfig) => unknown;

/** Deterministic client shared by every adapter case in the initial matrix. */
export function createDeterministicHevyClient(): HevyClient {
	const getWorkouts: HevyClient["getWorkouts"] = (params) =>
		Promise.resolve().then(() => {
			if (params?.page !== 1 || params.pageSize !== 5) {
				throw new Error(
					"Contract fixture received unexpected pagination input",
				);
			}
			return deterministicGetWorkoutsResult;
		});
	const getUserInfo: HevyClient["getUserInfo"] = () =>
		Promise.resolve({ data: { id: "contract-user" } });
	const native = createHevyClient({
		apiKey: "contract-test-key",
		maxGetRetries: 0,
		fetch: async (input) => {
			const request = input instanceof Request ? input : new Request(input);
			const url = new URL(request.url);
			const query =
				url.search.length === 0
					? undefined
					: {
							page: Number(url.searchParams.get("page")),
							pageSize: Number(url.searchParams.get("pageSize")),
						};
			const result =
				url.pathname === "/v1/workouts" && query === undefined
					? await getWorkouts()
					: url.pathname === "/v1/workouts"
						? await getWorkouts(query)
						: {};
			return new Response(JSON.stringify(result), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		},
	});
	const seam = Object.getOwnPropertySymbols(native).find((symbol) =>
		symbol.description?.includes("native-request-effect"),
	);
	if (seam === undefined) {
		throw new Error("Missing native request Effect seam in contract fixture");
	}
	const nativeRequestEffect = Reflect.get(native, seam) as RequestEffect;
	const client = Object.assign(
		Object.create(Object.getPrototypeOf(native)),
		native,
		{ getWorkouts, getUserInfo },
	) as HevyClient;
	Object.defineProperty(client, seam, {
		configurable: false,
		enumerable: false,
		value: ((config: RequestConfig) => {
			return nativeRequestEffect(config);
		}) satisfies RequestEffect,
		writable: false,
	});
	return client;
}
